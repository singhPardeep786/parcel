/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  sassOptions: {
    includePaths: ["./src/styles"],
  },
};

export default nextConfig;
