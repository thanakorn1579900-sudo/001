import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "แบบทดสอบงานอิเล็กทรอนิกส์รถยนต์",
  description: "ระบบสอบออนไลน์สำหรับงานอิเล็กทรอนิกส์รถยนต์เบื้องต้น",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
