import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ข้อสอบแผนกช่างยนต์ | ครูธนากร สมปาน",
  description: "ระบบสอบออนไลน์แผนกช่างยนต์ โดย ครูธนากร สมปาน",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
