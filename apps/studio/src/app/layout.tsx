import type { Metadata } from "next";
import "../studio.css";
export const metadata: Metadata = {
  title: "Studio One — plads til at skabe",
  description:
    "Dit kreative kontrolrum. Bestil, saml, sammenlign og acceptér konkrete leverancer.",
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
