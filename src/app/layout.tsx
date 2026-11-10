import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { SITE } from "@/lib/constants";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartBar } from "@/components/cart/CartBar";
import { LocationModal } from "@/components/layout/LocationModal";
import { DataSync } from "@/components/layout/DataSync";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  // 900 is used by the heavy uppercase headings (font-black); without it the browser fakes it.
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `${SITE.name} | Premium Burgers & Online Ordering`,
  description: SITE.description,
  metadataBase: new URL(SITE.url),
};

// Matches the dark header so mobile browser bars blend in.
export const viewport: Viewport = {
  themeColor: "#18181b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-950 text-white">
        <AuthProvider>
          <Suspense fallback={null}>
            <DataSync />
          </Suspense>
          <CartProvider>
            {children}
            <Suspense fallback={null}>
              <CartBar />
            </Suspense>
            <CartDrawer />
            <Suspense fallback={null}>
              <LocationModal />
            </Suspense>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
