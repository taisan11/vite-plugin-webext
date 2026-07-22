import path from 'node:path'
import type { WebExtensionManifest, WebAccessibleResourceMV3 } from '../types/manifest.ts'
import { normalizePath } from './path.ts'

export type UnlistedScripts = Record<string, string>

export function collectUnlistedScriptInputs(
  scripts: UnlistedScripts,
  rootDir: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scripts).map(([name, source]) => {
      const normalizedName = normalizeUnlistedScriptName(name)
      return [normalizedName, path.resolve(rootDir, normalizePath(source).replace(/^\.\//, ''))]
    }),
  )
}

export function resolveUnlistedScriptManifest(
  manifest: WebExtensionManifest,
  names: string[],
): WebExtensionManifest {
  if (names.length === 0) return manifest

  const resources = names.map((name) => `${normalizeUnlistedScriptName(name)}.js`)
  const resolved = structuredClone(manifest)
  const existing = resolved.web_accessible_resources

  if (
    resolved.manifest_version === 2 ||
    (Array.isArray(existing) && existing.every((entry) => typeof entry === 'string'))
  ) {
    resolved.web_accessible_resources = [
      ...(Array.isArray(existing)
        ? existing.filter((entry): entry is string => typeof entry === 'string')
        : []),
      ...resources,
    ]
    return resolved
  }

  const matches = [
    ...new Set(
      (resolved.content_scripts ?? []).flatMap((contentScript) => contentScript.matches),
    ),
  ]
  const resourceEntry: WebAccessibleResourceMV3 = {
    resources,
    matches: matches.length > 0 ? matches : ['<all_urls>'],
  }
  resolved.web_accessible_resources = [
    ...(Array.isArray(existing)
      ? existing.filter((entry): entry is WebAccessibleResourceMV3 => typeof entry !== 'string')
      : []),
    resourceEntry,
  ]
  return resolved
}

export function normalizeUnlistedScriptName(name: string): string {
  const normalized = normalizePath(name.trim()).replace(/^\/+|\/+$/g, '')
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('src/') ||
    normalized.includes('../')
  ) {
    throw new Error(`[vite-plugin-webext] Invalid unlisted script name: "${name}".`)
  }
  return normalized.endsWith('.js') ? normalized.slice(0, -3) : normalized
}
