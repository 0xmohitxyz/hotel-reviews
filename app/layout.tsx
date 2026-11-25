import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { DataHealth } from "@/components/DataHealth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Azzurro Hotels · Guest Review Insights",
  description: "Booking.com guest reviews for Azzurro Hotels properties, summarised for the operations team.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/reviews", label: "Reviews" },
  { href: "/topics", label: "Topics" },
  { href: "/ask", label: "✨ Ask AI" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="bg-white border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
            <Link href="/" className="font-semibold text-brand text-lg">
              Azzurro Hotels <span className="text-muted font-normal">· Guest Review Insights</span>
            </Link>
            <nav className="flex gap-1">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="px-3 py-1.5 rounded-md text-sm font-medium hover:bg-paper">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto text-xs text-muted">
              <Suspense fallback={null}>
                <DataHealth />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted">
          Source: public Booking.com guest reviews. Scores are out of 10. Weeks run Monday–Sunday, Sydney time.
        </footer>
      </body>
    </html>
  );
}
