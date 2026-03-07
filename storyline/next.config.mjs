/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/arco-ibf',
  assetPrefix: '/arco-ibf/',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
