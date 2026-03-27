import type { BrowserTarget } from './index'

// ── API compatibility ─────────────────────────────────────────────────────────

/** APIs that exist ONLY in Chrome (MV3+) */
export const CHROME_ONLY_APIS = [
  'offscreen',
  'enterprise',
  'documentScan',
  'gcm',
  'instanceID',
  'loginState',
  'platformKeys',
  'printingMetrics',
  'readingList',
  'search',
  'smartCardProviderPrivate',
  'systemLog',
  'topSites',
  'ttsEngine',
  'userScripts',
  'vpnProvider',
  'wallpaper',
  'webAuthenticationProxy',
] as const

/** APIs that exist ONLY in Firefox */
export const FIREFOX_ONLY_APIS = [
  'theme',
  'browserSettings',
  'captivePortal',
  'dns',
  'find',
  'geckoProfiler',
  'menus',        // Firefox name; Chrome calls this contextMenus
  'normandyAddonStudy',
  'pkcs11',
  'proxy',        // Firefox's proxy is richer
  'telemetry',
  'userScripts',  // MV2 only on Firefox
] as const

// ── Shim code generation ──────────────────────────────────────────────────────

/**
 * Generate the virtual module source.
 *
 * The shim:
 *  1. Picks the right global (`browser` for Firefox, `chrome` for Chrome)
 *  2. Wraps Chrome's callback-based APIs in Promises so callers can always await
 *  3. Assigns the result to both `globalThis.browser` and `globalThis.chrome`
 *     so existing code using either name works without changes
 */
export function generateShim(browser: BrowserTarget): string {
  if (browser === 'firefox') {
    return `
// vite-plugin-webext — Firefox shim
// Firefox already exposes a promise-based \`browser\` global in extensions.
// We just re-export it and also alias \`chrome\` for cross-browser code.

const _browser = globalThis.browser ?? globalThis.chrome

if (!globalThis.browser) globalThis.browser = _browser
if (!globalThis.chrome)  globalThis.chrome  = _browser

export default _browser
export { _browser as browser }
`.trimStart()
  }

  // Chrome: wrap callback APIs in Promises
  return `
// vite-plugin-webext — Chrome shim
// Wraps chrome.* callback APIs so you can always \`await browser.*\`.

function promisify(fn, ctx) {
  return function (...args) {
    // If the last arg is already a function, the caller passed a callback —
    // leave it alone so legacy code keeps working.
    if (typeof args[args.length - 1] === 'function') {
      return fn.apply(ctx, args)
    }
    return new Promise((resolve, reject) => {
      fn.apply(ctx, [
        ...args,
        (...result) => {
          const err = globalThis.chrome?.runtime?.lastError
          if (err) reject(new Error(err.message))
          else resolve(result.length <= 1 ? result[0] : result)
        },
      ])
    })
  }
}

function wrapNamespace(ns) {
  if (!ns || typeof ns !== 'object') return ns
  return new Proxy(ns, {
    get(target, prop) {
      const val = target[prop]
      if (typeof val === 'function') return promisify(val, target)
      if (val && typeof val === 'object' && !Array.isArray(val)) return wrapNamespace(val)
      return val
    },
  })
}

const _raw = globalThis.chrome
const _browser = new Proxy(_raw, {
  get(target, prop) {
    const ns = target[prop]
    if (ns && typeof ns === 'object' && !Array.isArray(ns)) return wrapNamespace(ns)
    return ns
  },
})

globalThis.browser = _browser
// Keep globalThis.chrome pointing to the raw API for code that expects callbacks
// globalThis.chrome is already set by the extension runtime

export default _browser
export { _browser as browser }
`.trimStart()
}
