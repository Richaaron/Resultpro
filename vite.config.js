import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEON_AUTH_BASE_URL"],
  server: {
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
