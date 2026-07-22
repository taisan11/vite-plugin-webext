export type ApiNamespace = 'browser' | 'chrome'

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
  'vpnProvider',
  'wallpaper',
  'webAuthenticationProxy',
] as const

export const FIREFOX_ONLY_APIS = [
  'theme',
  'browserSettings',
  'captivePortal',
  'dns',
  'find',
  'geckoProfiler',
  'menus',
  'normandyAddonStudy',
  'pkcs11',
  'proxy',
  'telemetry',
] as const

export function hasApiNamespaceAccess(code: string): boolean {
  return /\b(?:browser|chrome)\s*(?:\.|\?\.)/.test(code)
}

export function hasUnavailableApiAccess(code: string, api: string): boolean {
  const pattern = new RegExp(`(?:browser|chrome)\\??\\.${escapeRe(api)}\\b`)
  return pattern.test(code)
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
