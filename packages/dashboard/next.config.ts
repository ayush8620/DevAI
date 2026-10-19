import type { NextConfig } from "next";

// The dashboard moved from / to /dashboard (the landing page is now at /).
// Old bookmarks keep working.
const moved = ["usage", "settings", "api-docs"];

// Admin tools moved out of the user dashboard into the separate panel at /admin
// (non-admins get a 404 there).
const toAdmin: [string, string][] = [
  ["/dashboard/coupons", "/admin/coupons"],
  ["/dashboard/providers", "/admin/providers"],
  ["/dashboard/projects", "/admin/projects"],
  ["/providers", "/admin/providers"],
  ["/projects", "/admin/projects"],
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
            { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }];
  },
  async redirects() {
    return [
      ...moved.map((p) => ({ source: `/${p}`, destination: `/dashboard/${p}`, permanent: false })),
      ...toAdmin.map(([source, destination]) => ({ source, destination, permanent: false })),
    ];
  },
};
export default nextConfig;
