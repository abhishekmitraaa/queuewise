import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the API runs separately on port 8000; /api is proxied to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Recharts makes one ~600 kB bundle; fine for a local app.
  build: { chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
