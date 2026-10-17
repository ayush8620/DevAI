import type { NextConfig } from "next";

// The dashboard moved from / to /dashboard (the landing page is now at /).
// Old bookmarks keep working.
const moved = ["providers", "projects", "usage", "settings", "api-docs"];

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return moved.map((p) => ({ source: `/${p}`, destination: `/dashboard/${p}`, permanent: false }));
  },
};
export default nextConfig;
