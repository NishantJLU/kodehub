import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import * as esbuild from "esbuild";

function extensionScriptsPlugin(): Plugin {
  return {
    name: "vite-plugin-extension-scripts",
    async closeBundle() {
      // 1. Build self-contained content.js as an IIFE (crucial for Chrome Manifest V3 content scripts)
      await esbuild.build({
        entryPoints: [resolve(__dirname, "src/content/kodekloud.ts")],
        bundle: true,
        outfile: resolve(__dirname, "dist/content.js"),
        format: "iife",
        platform: "browser",
        target: "es2020",
        minify: false,
      });

      // 2. Build self-contained background.js as ESM
      await esbuild.build({
        entryPoints: [resolve(__dirname, "src/background/index.ts")],
        bundle: true,
        outfile: resolve(__dirname, "dist/background.js"),
        format: "esm",
        platform: "browser",
        target: "es2020",
        minify: false,
      });

      console.log("✓ Successfully bundled self-contained content.js (IIFE) and background.js (ESM)");
    },
  };
}

export default defineConfig({
  plugins: [react(), extensionScriptsPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
