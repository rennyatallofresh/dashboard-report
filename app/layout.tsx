import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlloFresh CS Dashboard",
  description: "Inbound and outbound customer service performance dashboard"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
