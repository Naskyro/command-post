import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

// Static frontend shell: same client components as the vinext app, bundled as
// a plain SPA for static hosting (no Cloudflare worker, D1, or R2 bindings).
export default defineConfig({
  root: `${root}spa`,
  publicDir: `${root}public`,
  resolve: {
    alias: { "@": root },
  },
  plugins: [react()],
  build: {
    outDir: `${root}dist-spa`,
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
});
