import {
  Activity,
  ArrowDownLeft,
  Award,
  BarChart2,
  Clock,
  Eye,
  List,
  Loader2,
  PackageX,
  Percent,
  PhoneCall,
  PhoneOutgoing,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Store,
  Ticket,
  User,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AnyRow = Record<string, any>;
type Tab = "inbound" | "outbound";

type DashboardResponse = {
  status: string;
  source?: string;
  isCached?: boolean;
  lastUpdatedText?: string;
  message?: string;
  errors?: string[];
  data?: {
    inbound?: AnyRow[];
    outbound?: AnyRow[];
  };
};

const moneyColors = ["#10b981", "#2563eb", "#f59e0b", "#f43f5e", "#7c3aed"];
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwe9ryGJfhxLLaCKhqzv_M-B7RpMY5fGqKBlBHaGqde8r09CffJrgEZJJJYThRgW-Y/exec";

function countBy(rows: AnyRow[], key: string) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] || "").trim();
    if (value && value !== "-") acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function topEntries(map: Record<string, number>, limit = 5) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function parseOutboundSla(value: unknown) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("unachieve") || normalized === "no" || normalized === "false") {
    return "Unachieve";
  }
  if (normalized.includes("achieve") || normalized === "yes" || normalized === "true") {
    return "Achieve";
  }
  return "-";
}

function uniqueOptions(rows: AnyRow[], key: string) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort();
}

function KpiCard({
  icon,
  label,
  value,
  tone = "emerald",
  sub
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "rose" | "blue" | "slate" | "indigo";
  sub?: string;
}) {
  return (
    <div className="kpi-card">
      <div className={`icon-tile ${tone}`}>{icon}</div>
      <div className="kpi-text">
        <p>{label}</p>
        <strong title={value}>{value}</strong>
        {sub ? <span>{sub}</span> : null}
      </div>
    </div>
  );
}

function MiniBars({ data, total, tone = "emerald" }: { data: [string, number][]; total: number; tone?: string }) {
  if (!data.length) return <p className="empty-small">Data tidak ditemukan.</p>;
  return (
    <div className="mini-list">
      {data.map(([name, count], index) => {
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <div className="mini-row" key={name}>
            <div className="mini-meta">
              <span>
                <b>{index + 1}</b>
                {name}
              </span>
              <strong>{count.toLocaleString()}</strong>
            </div>
            <div className="bar-track">
              <div className={`bar-fill ${tone}`} style={{ width: `${Math.max(pct, 4)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ values, labels }: { values: number[]; labels: string[] }) {
  const total = values.reduce((sum, item) => sum + item, 0);
  let offset = 25;
  const stops = values.map((value, index) => {
    const size = total ? (value / total) * 100 : 0;
    const start = offset;
    offset += size;
    return `${moneyColors[index % moneyColors.length]} ${start}% ${offset}%`;
  });

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: total ? `conic-gradient(${stops.join(", ")})` : "#e2e8f0" }}>
        <div>
          <strong>{total.toLocaleString()}</strong>
          <span>Total</span>
        </div>
      </div>
      <div className="legend">
        {labels.map((label, index) => (
          <span key={label}>
            <i style={{ background: moneyColors[index % moneyColors.length] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineTrend({ data }: { data: [string, number][] }) {
  const max = Math.max(...data.map((item) => item[1]), 1);
  const points = data.slice(-18).map(([, count], index, arr) => {
    const x = arr.length === 1 ? 0 : (index / (arr.length - 1)) * 100;
    const y = 100 - (count / max) * 85 - 8;
    return `${x},${y}`;
  });
  return (
    <div className="trend">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={points.join(" ")} fill="none" stroke="#10b981" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="trend-axis">
        <span>{data.slice(-18)[0]?.[0] || "-"}</span>
        <span>{data.slice(-1)[0]?.[0] || "-"}</span>
      </div>
    </div>
  );
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<Tab>("inbound");
  const [payload, setPayload] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [selected, setSelected] = useState<AnyRow | null>(null);

  async function loadDashboard(force = false) {
    force ? setSyncing(true) : setLoading(true);
    try {
      const response = await fetch(`${SCRIPT_URL}?api=data&force=${force}`, { cache: "no-store" });
      const json = await response.json();
      setPayload({ ...json, source: "apps-script" });
    } catch (error) {
      setPayload({
        status: "error",
        source: "unavailable",
        errors: [error instanceof Error ? error.message : "Gagal memuat data dashboard."],
        data: { inbound: [], outbound: [] }
      });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadDashboard(false);
  }, []);

  const inbound = useMemo(() => payload?.data?.inbound || [], [payload]);
  const outbound = useMemo(() => payload?.data?.outbound || [], [payload]);

  const filteredInbound = useMemo(() => {
    const q = search.toLowerCase();
    return inbound.filter((row) => {
      const text = [row._ticketNumber, row._agentName, row._store, row._category, row._picker, row._packer]
        .join(" ")
        .toLowerCase();
      return (!q || text.includes(q)) && (!source || row._source === source) && (!storeFilter || row._store === storeFilter);
    });
  }, [inbound, search, source, storeFilter]);

  const filteredOutbound = useMemo(() => {
    const q = search.toLowerCase();
    return outbound.filter((row) => {
      const text = [row._ticketNumber, row._agentName, row._store, row._callName, row._remark].join(" ").toLowerCase();
      const matchDate = (!dateStart || row._date >= dateStart) && (!dateEnd || row._date <= dateEnd);
      return matchDate && (!q || text.includes(q)) && (!storeFilter || row._store === storeFilter);
    });
  }, [outbound, search, storeFilter, dateStart, dateEnd]);

  const inboundStats = useMemo(() => {
    const total = filteredInbound.length;
    const frtRows = filteredInbound.filter((row) => Number(row._frtAgent) > 0);
    const csatRows = filteredInbound.filter((row) => Number(row._rating) > 0);
    const sla = filteredInbound.filter((row) => row._frtSla === "YES").length;
    return {
      total,
      avgFrt: frtRows.length ? frtRows.reduce((s, row) => s + Number(row._frtAgent), 0) / frtRows.length : 0,
      slaPct: total ? (sla / total) * 100 : 0,
      csat: csatRows.length ? csatRows.reduce((s, row) => s + Number(row._rating), 0) / csatRows.length : 0,
      topAgents: topEntries(countBy(filteredInbound, "_agentName")),
      topStores: topEntries(countBy(filteredInbound, "_store")),
      topCategories: topEntries(countBy(filteredInbound, "_category")),
      trend: Object.entries(countBy(filteredInbound, "_date")).sort((a, b) => a[0].localeCompare(b[0])) as [string, number][],
      pickerErrors: topEntries(countBy(filteredInbound.filter((row) => row._humanError === "YES"), "_picker")),
      packerErrors: topEntries(countBy(filteredInbound.filter((row) => row._humanError === "YES"), "_packer"))
    };
  }, [filteredInbound]);

  const outboundStats = useMemo(() => {
    const total = filteredOutbound.length;
    const achieve = filteredOutbound.filter((row) => parseOutboundSla(row._achieveSla) === "Achieve").length;
    const unachieve = filteredOutbound.filter((row) => parseOutboundSla(row._achieveSla) === "Unachieve").length;
    const topCustomer = topEntries(countBy(filteredOutbound, "_callName"), 1)[0];
    const topStatus = topEntries(countBy(filteredOutbound, "_finalStatus"), 1)[0];
    const topRemark = topEntries(countBy(filteredOutbound, "_remark"), 1)[0];
    return { total, achieve, unachieve, rate: total ? Math.round((achieve / total) * 100) : 0, topCustomer, topStatus, topRemark };
  }, [filteredOutbound]);

  const resetFilters = () => {
    setSearch("");
    setSource("");
    setStoreFilter("");
    setDateStart("");
    setDateEnd("");
  };

  const rows = activeTab === "inbound" ? filteredInbound : filteredOutbound;

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className={`brand-icon ${activeTab}`}>
            {activeTab === "inbound" ? <ArrowDownLeft size={24} /> : <PhoneOutgoing size={24} />}
          </div>
          <div>
            <h1>AlloFresh</h1>
            <p>{activeTab === "inbound" ? "Inbound Performance Hub" : "Outbound Performance Hub"}</p>
          </div>
        </div>
        <div className="top-actions">
          <div className="updated">
            <span>Terakhir Diperbarui</span>
            <strong>{payload?.lastUpdatedText || "-"}</strong>
          </div>
          <div className="tabs">
            <button className={activeTab === "inbound" ? "active inbound" : ""} onClick={() => setActiveTab("inbound")}>
              Inbound
            </button>
            <button className={activeTab === "outbound" ? "active outbound" : ""} onClick={() => setActiveTab("outbound")}>
              Outbound
            </button>
          </div>
          <button className="sync-btn" disabled={syncing} onClick={() => loadDashboard(true)}>
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            Sync Now
          </button>
        </div>
      </header>

      <section className="content">
        {payload?.errors?.length ? (
          <div className="notice">
            <strong>Data belum bisa dimuat.</strong>
            <span>{payload.errors[0]}</span>
          </div>
        ) : null}

        <section className="filter-panel">
          <div className="filter-title">
            <SlidersHorizontal size={18} />
            <strong>Advanced Filter</strong>
            <button onClick={resetFilters}>
              <RotateCcw size={15} />
              Reset
            </button>
          </div>
          <div className="filters">
            <label className="search-field">
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari tiket, agent, store, remark..." />
            </label>
            {activeTab === "inbound" ? (
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Semua Cabang</option>
                {uniqueOptions(inbound, "_source").map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            ) : (
              <>
                <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
                <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
              </>
            )}
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
              <option value="">Semua Store</option>
              {uniqueOptions(activeTab === "inbound" ? inbound : outbound, "_store").map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </section>

        {activeTab === "inbound" ? (
          <>
            <section className="kpi-grid">
              <KpiCard icon={<Ticket />} label="Total Tiket Inbound" value={inboundStats.total.toLocaleString()} tone="indigo" />
              <KpiCard icon={<Clock />} label="Rerata FRT Agent" value={`${inboundStats.avgFrt.toFixed(1)}m`} tone="amber" />
              <KpiCard icon={<ShieldCheck />} label="Pencapaian SLA FRT" value={`${inboundStats.slaPct.toFixed(1)}%`} />
              <KpiCard icon={<Smile />} label="Kepuasan Pelanggan" value={`${inboundStats.csat.toFixed(2)}/5.0`} tone="rose" />
            </section>
            <section className="dashboard-grid">
              <div className="main-stack">
                <div className="chart-grid">
                  <Panel title="Tren Tiket Inbound Harian" icon={<BarChart2 size={18} />}>
                    <LineTrend data={inboundStats.trend} />
                  </Panel>
                  <Panel title="Kategori Kasus Terbanyak" icon={<Activity size={18} />}>
                    <Donut values={inboundStats.topCategories.map(([, v]) => v)} labels={inboundStats.topCategories.map(([k]) => k)} />
                  </Panel>
                </div>
                <DataTable tab="inbound" rows={rows} onSelect={setSelected} />
              </div>
              <aside className="side-stack">
                <Panel title="Peringkat Agent" icon={<Award size={18} />}>
                  <MiniBars data={inboundStats.topAgents} total={inboundStats.total} />
                </Panel>
                <Panel title="Sebaran Kasus Per Store" icon={<Store size={18} />}>
                  <MiniBars data={inboundStats.topStores} total={inboundStats.total} tone="rose" />
                </Panel>
                <Panel title="Audit Picker & Packer" icon={<PackageX size={18} />}>
                  <h4>Picker Error</h4>
                  <MiniBars data={inboundStats.pickerErrors} total={Math.max(inboundStats.pickerErrors[0]?.[1] || 0, 1)} tone="rose" />
                  <h4>Packer Error</h4>
                  <MiniBars data={inboundStats.packerErrors} total={Math.max(inboundStats.packerErrors[0]?.[1] || 0, 1)} tone="rose" />
                </Panel>
              </aside>
            </section>
          </>
        ) : (
          <>
            <section className="kpi-grid">
              <KpiCard icon={<PhoneCall />} label="Total Calls" value={outboundStats.total.toLocaleString()} />
              <KpiCard icon={<ShieldCheck />} label="Achieve SLA" value={outboundStats.achieve.toLocaleString()} tone="blue" />
              <KpiCard icon={<ShieldAlert />} label="Unachieve SLA" value={outboundStats.unachieve.toLocaleString()} tone="rose" />
              <KpiCard icon={<Percent />} label="SLA Rate" value={`${outboundStats.rate}%`} tone="amber" />
            </section>
            <section className="kpi-grid three">
              <KpiCard icon={<User />} label="Top Customer" value={outboundStats.topCustomer?.[0] || "-"} sub={`${outboundStats.topCustomer?.[1] || 0} Panggilan`} />
              <KpiCard icon={<Activity />} label="Top Final Status" value={outboundStats.topStatus?.[0] || "-"} sub={`${outboundStats.topStatus?.[1] || 0} Kasus`} tone="blue" />
              <KpiCard icon={<List />} label="Top Remark Note" value={outboundStats.topRemark?.[0] || "-"} sub={`${outboundStats.topRemark?.[1] || 0} Catatan`} tone="slate" />
            </section>
            <section className="dashboard-grid single">
              <div className="main-stack">
                <Panel title="Distribusi SLA Status" icon={<Activity size={18} />}>
                  <Donut values={[outboundStats.achieve, outboundStats.unachieve]} labels={["Achieve SLA", "Unachieve SLA"]} />
                </Panel>
                <DataTable tab="outbound" rows={rows} onSelect={setSelected} />
              </div>
            </section>
          </>
        )}
      </section>

      {loading ? (
        <div className="loading">
          <Loader2 className="spin" />
          <strong>Membaca dashboard cache</strong>
          <span>Memuat data dari Apps Script dan Google Drive cache.</span>
        </div>
      ) : null}

      {selected ? <DetailModal tab={activeTab} row={selected} onClose={() => setSelected(null)} /> : null}
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function DataTable({ tab, rows, onSelect }: { tab: Tab; rows: AnyRow[]; onSelect: (row: AnyRow) => void }) {
  const display = rows.slice(0, 100);
  return (
    <section className="panel table-panel">
      <div className="table-title">
        <h2>
          <List size={18} />
          {tab === "inbound" ? "Daftar Riwayat Penanganan Tiket" : "Daftar Riwayat Panggilan"}
        </h2>
        <span>{rows.length.toLocaleString()} {tab === "inbound" ? "Tiket" : "Calls"}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            {tab === "inbound" ? (
              <tr><th>ID Tiket</th><th>Tanggal</th><th>Cabang</th><th>Store</th><th>Agent</th><th>FRT & CSAT</th><th>SLA</th></tr>
            ) : (
              <tr><th>No. Call ID</th><th>Tanggal</th><th>Pelanggan</th><th>Hasil</th><th>Remark</th><th>Agent</th><th>SLA</th><th>Opsi</th></tr>
            )}
          </thead>
          <tbody>
            {!display.length ? (
              <tr><td colSpan={tab === "inbound" ? 7 : 8} className="empty-cell">Tidak ada data yang cocok dengan filter.</td></tr>
            ) : display.map((row, index) => tab === "inbound" ? (
              <tr key={`${row._ticketNumber}-${index}`} onClick={() => onSelect(row)}>
                <td>{row._ticketNumber || "-"}</td><td>{row._date || "-"}</td><td>{row._source || "-"}</td><td>{row._store || "-"}</td><td>{row._agentName || "-"}</td>
                <td>{Number(row._frtAgent || 0).toFixed(1)}m | {row._rating || 0}/5</td><td><Badge ok={row._frtSla === "YES"}>{row._frtSla || "NO"}</Badge></td>
              </tr>
            ) : (
              <tr key={`${row._ticketNumber}-${index}`}>
                <td>{row._ticketNumber || "-"}</td><td>{row._date || "-"}</td><td>{row._callName || "-"}</td><td>{row._finalStatus || "-"}</td><td className="truncate">{row._remark || "-"}</td><td>{row._agentName || "-"}</td>
                <td><Badge ok={parseOutboundSla(row._achieveSla) === "Achieve"}>{parseOutboundSla(row._achieveSla)}</Badge></td><td><button className="icon-btn" onClick={() => onSelect(row)}><Eye size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer>Menampilkan maksimal 100 baris pertama dari hasil filter.</footer>
    </section>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`badge ${ok ? "ok" : "bad"}`}>{children}</span>;
}

function DetailModal({ tab, row, onClose }: { tab: Tab; row: AnyRow; onClose: () => void }) {
  const fields = tab === "inbound"
    ? [
        ["Store Penjualan", row._store], ["Tanggal Transaksi", row._date], ["CS Agent", row._agentName],
        ["Kanal", row._channel], ["Rating CSAT", row._rating], ["Kategori", row._category],
        ["Sub Kategori", row._subCategory], ["Klasifikasi", row._classification], ["FRT Agent", `${Number(row._frtAgent || 0).toFixed(1)} Menit`],
        ["FRT SLA", row._frtSla], ["Handling Time", row._handlingTime], ["Picker", row._picker], ["Packer", row._packer]
      ]
    : [
        ["Nama Customer", row._callName], ["Tanggal Hubung", row._date], ["Nama Agent", row._agentName],
        ["Store Cabang", row._store], ["SLA Status", parseOutboundSla(row._achieveSla)], ["Status Akhir", row._finalStatus],
        ["Remark Agen", row._remark]
      ];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>{row._ticketNumber || (tab === "inbound" ? "Detail Inbound Tiket" : "Detail Outbound Call")}</strong>
            <span>SUMBER DATA: {row._source || "-"}</span>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </header>
        <div className="detail-grid">
          {fields.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{String(value || "-")}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
