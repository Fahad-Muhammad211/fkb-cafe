import type { NextConfig } from "next";

// `next dev` serves its scripts and hot-reload socket only to localhost by default. Opening the app at
// another host (http://127.0.0.1:3000, or the LAN "Network" address) then gets no JavaScript, so no page
// hydrates and every session gate stays on its loading screen. 127.0.0.1 is always allowed; add more
// hostnames (no scheme or port) in DEV_ALLOWED_ORIGINS, comma-separated. Ignored by `next build`/`next start`.
const devOrigins = ["127.0.0.1", ...(process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((h) => h.trim()).filter(Boolean)];

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // 90 keeps the homepage hero banners crisp; 75 is the default for everything else.
    qualities: [75, 90],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
