/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep postgres.js unbundled so its package exports resolve the `workerd`
  // condition at runtime on Cloudflare. Bundled with platform=node instead,
  // its pooled TCP sockets die when each request finishes and the next
  // request hangs on a dead connection until the runtime cancels it
  // (opennextjs-cloudflare#548).
  serverExternalPackages: ['postgres'],
  serverActions: {
    bodySizeLimit: '10mb',
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        // Never let browsers or the CDN serve stale HTML for any page.
        // Hashed _next/static assets keep their immutable caching.
        source: '/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;

if (process.env.NODE_ENV === 'development') {
  import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev());
}
