/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: "/console", destination: "/conduit-crm/index.html" }];
  },
};

export default nextConfig;
