/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: "/console", destination: "/conduit-crm/index.html" }];
  },
  async redirects() {
    return [
      { source: "/design", destination: "/discover", permanent: false },
      { source: "/floor", destination: "/calls", permanent: false },
      { source: "/offers", destination: "/reports", permanent: false },
      { source: "/proof", destination: "/reports", permanent: false },
      { source: "/studio", destination: "/copilot", permanent: false },
      { source: "/ads", destination: "/discover", permanent: false },
      { source: "/numbers", destination: "/reports", permanent: false },
      { source: "/money", destination: "/reports", permanent: false },
      { source: "/investment", destination: "/reports", permanent: false },
      { source: "/appointments", destination: "/calendar", permanent: false },
      { source: "/people", destination: "/leads", permanent: false },
      { source: "/board", destination: "/pipeline", permanent: false },
      { source: "/callbacks", destination: "/tasks", permanent: false },
      { source: "/accounts", destination: "/companies", permanent: false },
      { source: "/analytics", destination: "/reports", permanent: false },
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
