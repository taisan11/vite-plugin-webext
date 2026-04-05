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
  }
}
