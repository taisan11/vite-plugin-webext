// vite-plugin-webext — type augmentation
// Add this file to your tsconfig "include" or use /// <reference types="vite-plugin-webext/types" />

/// <reference types="@types/chrome" />

// ── import.meta.env ───────────────────────────────────────────────────────────

interface ImportMetaEnv {
  /** Target browser for this build: 'chrome' | 'firefox' */
  readonly BROWSER: 'chrome' | 'firefox'
  /** true when building for Firefox */
  readonly IS_FIREFOX: boolean
  /** true when building for Chrome */
  readonly IS_CHROME: boolean
}

// ── Virtual module ────────────────────────────────────────────────────────────

declare module 'virtual:webext/browser' {
  /**
   * Unified, always-promise-based browser extension API.
   * On Chrome, callbacks are automatically wrapped in Promises.
   * On Firefox, the native `browser` global is returned as-is.
   */
  const browser: typeof chrome
  export default browser
  export { browser }
}

// ── Global augmentation ───────────────────────────────────────────────────────
// Ensures `browser` is recognised as a global alongside `chrome`.

declare global {
  /**
   * Promise-based browser extension API (normalised across Chrome & Firefox).
   * Injected by `vite-plugin-webext`.
   */
  const browser: typeof chrome
}
