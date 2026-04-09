import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const localApiPort = process.env.CRM_BACKEND_PORT || process.env.DASHBOARD_API_PORT || "3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify; file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== "true",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${localApiPort}`,
        changeOrigin: true,
      },
    },
  },
});
