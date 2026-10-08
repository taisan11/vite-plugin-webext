/// <reference types="firefox-webext-browser" />

export {}

declare global {
  interface ImportMetaEnv {
    /** Target browser for this build: 'chrome' | 'firefox' */
    readonly BROWSER: 'chrome' | 'firefox'
    /** true when building for Firefox */
    readonly IS_FIREFOX: boolean
    /** true when building for Chrome */
    readonly IS_CHROME: boolean
    /** Build-time map of unlisted script names to Vite output paths */
    readonly WEBEXT_UNLISTED_SCRIPT_PATHS: string | Readonly<Record<string, string>>
  }
}
