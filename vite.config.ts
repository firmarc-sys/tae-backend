import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    outDir: "dist-live",
    assetsDir: "_assets",
    emptyOutDir: false,
  },
  server: {
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": `http://localhost:${process.env.VITE_BACKEND_PORT || 3101}`,
    },
    watch: {
      ignored: [
        "**/node_modules/**",
        "**/.venv/**",
        "**/.git/**",
        "**/dist/**",
        "**/__pycache__/**",
      ],
    },
  },
});
