/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ['react-quill'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'quill$': 'quill/dist/quill.js',
    };
    return config;
  },
}

module.exports = nextConfig 