import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemoryMirror",
  description: "See what AI remembers. Understand why.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
