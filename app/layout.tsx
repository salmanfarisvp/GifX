import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GifX — Video to GIF Converter",
  description:
    "Convert videos to high-quality GIFs right in your browser. No uploads, no dependencies, 100% private.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
