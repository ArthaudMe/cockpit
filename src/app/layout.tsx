import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mio Cockpit",
  description: "Founder's cockpit — see your situation, work with your agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
