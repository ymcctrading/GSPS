/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The engine ships a Python file and test files; keep them out of the build graph.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
