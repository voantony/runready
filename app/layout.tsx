import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RunReady",
  description: "Prove your AGENTS.md still installs on a clean machine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-serif text-ink antialiased">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5">
          <header className="flex items-center justify-between py-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full border border-stamp text-xs font-mono text-stamp">
                RR
              </span>
              <span className="font-mono text-sm tracking-[0.22em]">RUNREADY</span>
            </Link>
            <nav className="flex gap-5 font-mono text-xs tracking-wide text-moss">
              <a href="/#how">How it works</a>
            </nav>
          </header>
          <div className="flex-1">{children}</div>
          <footer className="py-8 font-mono text-xs text-moss">
            Free and open source. Public GitHub and GitLab repositories only.
          </footer>
        </div>
      </body>
    </html>
  );
}
