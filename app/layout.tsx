import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Hind_Siliguri } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bengali",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bongo AI | Voice Assistant & Live Web Intelligence",
  description:
    "Bongo AI — Bilingual Bengali & English AI Voice Assistant with real-time plasma ring visualization and live website news browsing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="bn"
      className={`${plusJakarta.variable} ${hindSiliguri.variable}`}
    >
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="font-[family-name:var(--font-sans),var(--font-bengali),sans-serif] bg-[#030207] text-slate-50 antialiased selection:bg-fuchsia-500/35 selection:text-white">
        {children}
      </body>
    </html>
  );
}
