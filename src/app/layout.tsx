import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { DISCREET_COOKIE, isDiscreet } from "@/lib/discreet";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Carteira Cripto",
  description: "Dashboard da sua carteira de criptoativos",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Modo discreto já aplicado na primeira pintura (sem os valores aparecerem por um instante).
  const discreet = isDiscreet((await cookies()).get(DISCREET_COOKIE)?.value);
  return (
    <html
      lang="pt-BR"
      data-discreet={discreet ? "" : undefined}
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
