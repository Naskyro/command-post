import type { Metadata } from "next";
import "./globals.css";
import ActionHints from "@/components/shared/ActionHints";
import WorkspaceTheme from "@/components/preferences/WorkspaceTheme";

export const metadata: Metadata = {
  title: "Command | Parking & Towing Enforcement",
  description: "Operational account, property, compliance, and recovery workspace.",
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
      <body className="antialiased"><WorkspaceTheme>{children}<ActionHints/></WorkspaceTheme></body>
    </html>
  );
}
