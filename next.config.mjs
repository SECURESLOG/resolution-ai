/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['opik'],
  experimental: {
    serverComponentsExternalPackages: ['opik'],
  },
}

export default nextConfig
