/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove 'standalone' output for Vercel deployment
  // output: 'standalone', // Only use for Docker deployments
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;

