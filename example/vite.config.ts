import { defineConfig } from "vite";
import { viteImageOptimizer } from "@olwiba/vio";

export default defineConfig({
  plugins: [
    viteImageOptimizer({
      inputPath: "src/images",
      outputPath: "dist/images",
      quality: 80,
    }),
  ],
  resolve: {
    alias: {
      "@images": "/dist/images",
    },
  },
});
