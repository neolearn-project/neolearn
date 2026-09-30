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
      "pdfjs-dist",
    ],
    outputFileTracingIncludes: {
      "/api/admin/textbooks/process": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    },
  },
};

module.exports = nextConfig;
