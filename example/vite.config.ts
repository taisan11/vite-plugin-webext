import { defineConfig } from "vite"
import { webext } from "../src"

export default defineConfig({
  plugins: [
    webext({
      defaultBrowser: "chrome",
      manifest: (browser) => ({
        manifest_version: 3,
        name: `vite-plugin-webext example (${browser})`,
        version: "1.0.0",
        description: "Example extension built with @taisan11/vite-plugin-webext",
        background: {
          service_worker: "src/background.ts",
          type: "module",
        },
        action: {
          default_popup: "src/popup/index.html",
          default_title: "vite-plugin-webext example",
        },
        options_ui: {
          page: "src/options/index.html",
          open_in_tab: true,
        },
        permissions: ["storage", "tabs"],
        host_permissions: ["<all_urls>"],
      }),
    }),
  ],
})
