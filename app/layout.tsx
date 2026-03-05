import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "GifX — Video to GIF Converter, GIF Compressor & Image Converter",
  description:
    "Convert videos to high-quality GIFs, compress existing GIFs, and convert images between formats right in your browser. No uploads, no dependencies, 100% private.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
