import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/admin/import",
        destination: "/admin/resume?step=profile&import=1",
        permanent: false,
      },
      {
        source: "/admin/projects",
        destination: "/admin/resume?step=projects",
        permanent: false,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
