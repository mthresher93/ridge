/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: "/console", destination: "/conduit-crm/index.html" }];
  },
  async redirects() {
    return [
      { source: "/design", destination: "/discover", permanent: false },
      { source: "/map", destination: "/people", permanent: false },
      { source: "/floor", destination: "/outreach", permanent: false },
      { source: "/offers", destination: "/analytics", permanent: false },
      { source: "/proof", destination: "/analytics", permanent: false },
      { source: "/studio", destination: "/copilot", permanent: false },
      { source: "/ads", destination: "/discover", permanent: false },
      { source: "/numbers", destination: "/analytics", permanent: false },
      { source: "/money", destination: "/analytics", permanent: false },
      { source: "/investment", destination: "/analytics", permanent: false },
      { source: "/appointments", destination: "/shipments", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
