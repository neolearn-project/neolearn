/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "remotion",
      "@remotion/renderer",
      "@remotion/bundler",
      "@rspack/core",
      "@rspack/binding",
      "@rspack/binding-win32-x64-msvc",
    ],
  },
};

module.exports = nextConfig;