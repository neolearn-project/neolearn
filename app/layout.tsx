import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import IntroGate from "./components/IntroGate";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "NeoLearn",
  description: "NeoLearn – AI Teachers for Every Child",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Razorpay Checkout Script */}
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />

        {/* Netflix-style NeoLearn Intro */}
        <IntroGate>
          {children}
        </IntroGate>
      </body>
    </html>
  );
}
