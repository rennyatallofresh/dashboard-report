import { NextResponse } from "next/server";

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwe9ryGJfhxLLaCKhqzv_M-B7RpMY5fGqKBlBHaGqde8r09CffJrgEZJJJYThRgW-Y/exec";

const INBOUND_CACHE_ID = "1RrmEvAvGD3_625-aADrTFApbK6aIfzuU";
const OUTBOUND_CACHE_ID = "12WyAg3jLTgTsrgbduyWJ3WYA2V-43_am";

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store", redirect: "follow" });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  if (contentType.includes("text/html") || text.trim().startsWith("<")) {
    const isGoogleSignIn =
      text.includes("Sign in - Google Accounts") ||
      text.includes("accounts.google.com");

    throw new Error(
      isGoogleSignIn
        ? "Google returned a sign-in page instead of JSON. Publish the Apps Script web app with access set to Anyone, or make the Drive cache files public/downloadable."
        : "The remote URL returned HTML instead of JSON."
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The remote URL did not return valid JSON.");
  }
}

async function fetchDriveCache(fileId: string) {
  return fetchJson(`https://drive.google.com/uc?export=download&id=${fileId}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  try {
    const scriptData = await fetchJson(`${SCRIPT_URL}?api=data&force=${force}`);
    return NextResponse.json({
      ...scriptData,
      source: "apps-script"
    });
  } catch (scriptError) {
    try {
      const [inboundCache, outboundCache] = await Promise.all([
        fetchDriveCache(INBOUND_CACHE_ID),
        fetchDriveCache(OUTBOUND_CACHE_ID)
      ]);

      return NextResponse.json({
        status: "warning",
        isCached: true,
        source: "drive-cache",
        lastUpdatedText:
          inboundCache?.lastUpdatedText || outboundCache?.lastUpdatedText || "-",
        errors: [
          `Apps Script fetch failed: ${
            scriptError instanceof Error ? scriptError.message : "Unknown error"
          }`
        ],
        data: {
          inbound: inboundCache?.data || [],
          outbound: outboundCache?.data || []
        }
      });
    } catch (cacheError) {
      return NextResponse.json(
        {
          status: "error",
          source: "unavailable",
          message: "Unable to load Apps Script data or Drive cache.",
          errors: [
            scriptError instanceof Error ? scriptError.message : String(scriptError),
            cacheError instanceof Error ? cacheError.message : String(cacheError)
          ],
          data: { inbound: [], outbound: [] }
        },
        { status: 502 }
      );
    }
  }
}
