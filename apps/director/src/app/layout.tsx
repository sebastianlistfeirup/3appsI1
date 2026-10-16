import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Director — dit set, din fortælling",
  description:
    "Et lokalt filmværksted til scener, kameraer, storyboard og animatic.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
