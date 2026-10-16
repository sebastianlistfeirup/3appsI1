import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FlowLab · Dit beslutningslaboratorium",
  description:
    "Byg processen. Afprøv ændringen. Forstå konsekvensen. Et lokalt laboratorium med syntetiske data.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
