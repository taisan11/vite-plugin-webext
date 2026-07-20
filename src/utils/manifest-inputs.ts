import path from 'node:path'
import type { WebExtensionManifest } from '../types/manifest.ts'
import { normalizePath } from './path.ts'

/**
 * Collect entry-ish file paths declared in a manifest that should be built
 * as bundle inputs. HTML pages are referenced directly; script files that
 * sit next to an HTML page are resolved by Vite when the page is processed,
 * so only the HTML (or the top-level script) needs to be listed.
 */
export function collectManifestInputs(
  manifest: WebExtensionManifest,
  rootDir: string,
): Record<string, string> {
  const entries = new Map<string, string>()

  const addHtml = (name: string, relativePath: string | undefined) => {
    if (!relativePath) return
    if (!isHtmlPath(relativePath)) return
    if (entries.has(name)) return
    entries.set(name, resolveInputPath(relativePath, rootDir))
  }

  const addScript = (name: string, relativePath: string | undefined) => {
    if (!relativePath) return
    if (entries.has(name)) return
    entries.set(name, resolveInputPath(relativePath, rootDir))
  }

  // Background
  const background = manifest.background
  if (background) {
    if ('service_worker' in background && background.service_worker) {
      addScript('background', background.service_worker)
    } else {
      const mv2 = background as { page?: string; scripts?: string[] }
      if (mv2.page) addHtml('background', mv2.page)
      if (mv2.scripts) {
        for (const script of mv2.scripts) addScript(`background-${path.basename(script, path.extname(script))}`, script)
      }
    }
  }

  // Action / browser_action / page_action popups
  const actions = [manifest.action, manifest.browser_action, manifest.page_action].filter(Boolean)
  for (const action of actions) {
    const popup = (action as { default_popup?: string }).default_popup
    if (popup) addHtml('popup', popup)
  }

  // Options pages
  if (manifest.options_ui?.page) addHtml('options', manifest.options_ui.page)
  if (manifest.options_page) addHtml('options', manifest.options_page)

  // DevTools page
  if (manifest.devtools_page) addHtml('devtools', manifest.devtools_page)

  // Side panel / sidebar action
  if (manifest.side_panel?.default_path) addHtml('side_panel', manifest.side_panel.default_path)
  if (manifest.sidebar_action?.default_panel) addHtml('sidebar', manifest.sidebar_action.default_panel)

  // Chrome URL overrides
  const overrides = manifest.chrome_url_overrides
  if (overrides) {
    if (overrides.newtab) addHtml('newtab', overrides.newtab)
    if (overrides.bookmarks) addHtml('bookmarks', overrides.bookmarks)
    if (overrides.history) addHtml('history', overrides.history)
  }

  // Sandbox pages
  if (manifest.sandbox?.pages) {
    manifest.sandbox.pages.forEach((page, index) => addHtml(`sandbox-${index}`, page))
  }

  return Object.fromEntries(entries)
}

function isHtmlPath(relativePath: string): boolean {
  return /\.html?$/i.test(relativePath.trim())
}

function resolveInputPath(relativePath: string, rootDir: string): string {
  const normalized = normalizePath(relativePath.replace(/^\.?\//, ''))
  return path.resolve(rootDir, normalized)
}
