import path from 'node:path'
import type { Manifest, Rolldown } from 'vite'
import type { BackgroundMV2, IconSet, WebExtensionManifest } from '../types/manifest.ts'
import { normalizePath } from './path.ts'

export function readBuildManifest(bundle: Rolldown.OutputBundle, fileName: string): Manifest {
  const asset = bundle[normalizePath(fileName)]
  if (!asset || asset.type !== 'asset') {
    throw new Error(`[vite-plugin-webext] Could not find Vite build manifest "${fileName}".`)
  }
  const source = typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
  return JSON.parse(source) as Manifest
}

/** Resolve paths from Vite's manifest without renaming any generated files. */
export function createOutputPathResolver(
  manifest: Manifest,
  root: string,
  automaticInputs: Record<string, string>,
  effectiveInputs: Record<string, string>,
  bundle: Rolldown.OutputBundle,
) {
  const outputs = new Map<string, string>()
  const sourceKey = (source: string) => normalizePath(path.resolve(root, source))
  for (const [key, entry] of Object.entries(manifest)) {
    outputs.set(sourceKey(entry.src ?? key), entry.file)
  }
  // Vite's HTML manifest entries describe their JS entry chunk, not the HTML
  // page. Resolve page paths from the emitted HTML asset's source metadata.
  for (const output of Object.values(bundle)) {
    if (output.type !== 'asset' || !/\.html?$/i.test(output.fileName)) continue
    for (const original of output.originalFileNames) outputs.set(sourceKey(original), output.fileName)
  }
  // A named user entry may override a manifest-derived entry. The extension
  // must reference that replacement, not a source which was never bundled.
  for (const [name, source] of Object.entries(automaticInputs)) {
    const effectiveSource = effectiveInputs[name]
    const output = effectiveSource && outputs.get(sourceKey(effectiveSource))
    if (output) outputs.set(sourceKey(source), output)
  }
  return (source: string): string => {
    if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(source) || source.startsWith('//')) return source
    return outputs.get(sourceKey(source)) ?? source
  }
}

/** Rewrite only manifest resource fields, never names, descriptions or permissions. */
export function resolveExtensionManifestPaths(
  manifest: WebExtensionManifest,
  resolve: (source: string) => string,
): WebExtensionManifest {
  const result = structuredClone(manifest)
  const icon = (value: string | IconSet | undefined) => {
    if (typeof value === 'string') return resolve(value)
    if (value) return Object.fromEntries(Object.entries(value).map(([size, file]) => [size, resolve(file)]))
    return value
  }
  if (result.icons) result.icons = icon(result.icons) as IconSet
  for (const action of [result.action, result.browser_action, result.page_action]) {
    if (!action) continue
    if (action.default_popup) action.default_popup = resolve(action.default_popup)
    if (action.default_icon) action.default_icon = icon(action.default_icon)
    if ('theme_icons' in action) {
      for (const entry of action.theme_icons ?? []) {
        if (entry.light) entry.light = resolve(entry.light)
        if (entry.dark) entry.dark = resolve(entry.dark)
      }
    }
  }
  if (result.background) {
    if ('service_worker' in result.background) {
      result.background.service_worker = resolve(result.background.service_worker)
    } else {
      const background = result.background as BackgroundMV2
      if (background.page) background.page = resolve(background.page)
      if (background.scripts) background.scripts = background.scripts.map(resolve)
    }
  }
  if (result.options_page) result.options_page = resolve(result.options_page)
  if (result.options_ui) result.options_ui.page = resolve(result.options_ui.page)
  if (result.devtools_page) result.devtools_page = resolve(result.devtools_page)
  if (result.side_panel?.default_path) result.side_panel.default_path = resolve(result.side_panel.default_path)
  if (result.sidebar_action) {
    result.sidebar_action.default_panel = resolve(result.sidebar_action.default_panel)
    if (result.sidebar_action.default_icon) result.sidebar_action.default_icon = icon(result.sidebar_action.default_icon)
  }
  for (const [key, value] of Object.entries(result.chrome_url_overrides ?? {})) {
    if (value) (result.chrome_url_overrides as Record<string, string>)[key] = resolve(value)
  }
  if (result.sandbox) result.sandbox.pages = result.sandbox.pages.map(resolve)
  for (const content of result.content_scripts ?? []) {
    if (content.js) content.js = content.js.map(resolve)
    if (content.css) content.css = content.css.map(resolve)
  }
  if (result.web_accessible_resources) {
    result.web_accessible_resources = result.web_accessible_resources.map((entry) =>
      typeof entry === 'string' ? resolve(entry) : { ...entry, resources: entry.resources.map(resolve) },
    ) as WebExtensionManifest['web_accessible_resources']
  }
  for (const ruleset of result.declarative_net_request?.rule_resources ?? []) ruleset.path = resolve(ruleset.path)
  if (result.user_scripts?.api_script) result.user_scripts.api_script = resolve(result.user_scripts.api_script)
  for (const theme of [result.theme, result.dark_theme]) {
    for (const [name, value] of Object.entries(theme?.images ?? {})) {
      if (theme?.images && value) theme.images[name] = Array.isArray(value) ? value.map(resolve) : resolve(value)
    }
  }
  return result
}
