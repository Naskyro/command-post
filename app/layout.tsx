import type { Metadata } from "next";
import "./globals.css";
import WorkspaceTheme from "@/components/preferences/WorkspaceTheme";

export const metadata: Metadata = {
  title: "Command Post | Parking & Towing Enforcement",
  description: "Operational account, property, compliance, and recovery workspace.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><WorkspaceTheme>{children}</WorkspaceTheme></body>
    </html>
  );
}
