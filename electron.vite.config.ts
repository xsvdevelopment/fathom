import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const shared = { "@shared": resolve(__dirname, "src/shared") };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].js" } } },
  },
  renderer: {
    root: "src/renderer",
    resolve: { alias: { ...shared, "@": resolve(__dirname, "src/renderer/src") } },
    plugins: [react(), tailwindcss()],
  },
});
