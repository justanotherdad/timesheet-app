import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeScript from "@/components/ThemeScript";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CTG Timesheet Management",
  description: "CTG Timesheet Management System",
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
};

// Removed force-dynamic — this root layout contains no dynamic data fetching.
// Individual pages that require live data (e.g. auth checks) set their own
// export const dynamic = 'force-dynamic' as needed.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 dark:bg-gray-900 text-black dark:text-gray-100`}
      >
        {children}
      </body>
    </html>
  );
}
