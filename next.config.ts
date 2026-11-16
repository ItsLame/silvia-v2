import type { NextConfig } from "next";

// Rebuild typed content on every markdown change while `next dev` runs.
// (`pnpm build` runs `velite build` via the prebuild script instead.)
if (process.argv.includes("dev") && !process.env.VELITE_STARTED) {
  process.env.VELITE_STARTED = "1";
  import("velite").then(({ build }) => build({ watch: true, clean: false }));
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
