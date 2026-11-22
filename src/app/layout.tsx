import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rosterly | Workforce Operations",
  description: "Plan, validate, and manage monthly workforce rosters with accountable AI support.",
  applicationName: "Rosterly",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
