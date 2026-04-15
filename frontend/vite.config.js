import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // ── Dev-server proxy ─────────────────────────────────────────────────────────
  // In development, VITE_API_URL is "/api" (relative).
  // This proxy intercepts every request that starts with /api and forwards
  // it to the local FastAPI backend at port 8000, stripping the /api prefix.
  //
  // In production (Vercel), VITE_API_URL is set to the full Render URL
  // (e.g. https://financeos.onrender.com) via Vercel environment variables,
  // so this proxy block is never reached in the deployed build.
  server: {
    proxy: {
      "/api": {
        target: "https://project-financeos.vercel.app/",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
