import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Afrikaans Learning Suite",
  description: "A unified language learning app for Afrikaans - LingQ-style reader, Clozemaster-style practice, Anki integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans antialiased bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen`}
      >
        {children}
        {/* Spacer for mobile bottom nav — invisible on sm+ */}
        <div className="h-16 sm:hidden" aria-hidden="true" />
      </body>
    </html>
  );
}
