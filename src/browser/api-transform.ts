import {
  createMagicString,
  finishMagicStringTransform,
  type MagicStringLike,
  type MagicStringMap,
  type MagicStringOptions,
} from '../magic-string.ts'
import { walkAst, type AstNode } from '../utils/ast.ts'

type BrowserTarget = 'chrome' | 'firefox'

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

export function resolveApiNamespace(browser: BrowserTarget): ApiNamespace {
  return browser === 'chrome' ? 'chrome' : 'browser'
}

export function rewriteApiNamespaces(
  code: string,
  parse: (source: string) => unknown,
  targetNamespace: ApiNamespace,
  options: MagicStringOptions = {},
): {
  count: number
  code: string | MagicStringLike
  map: MagicStringMap | null
} {
  const ast = parse(code) as AstNode
  const magic = createMagicString(code, options)
  let count = 0

  walkAst(ast, (node) => {
    if ((node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') || node.computed) {
      return
    }

    const object = node.object as AstNode | undefined
    if (
      object?.type === 'Identifier' &&
      (object.name === 'chrome' || object.name === 'browser') &&
      object.name !== targetNamespace &&
      typeof object.start === 'number' &&
      typeof object.end === 'number'
    ) {
      magic.overwrite(object.start, object.end, targetNamespace)
      count++
    }
  })

  return {
    count,
    ...finishMagicStringTransform(code, magic, count, options),
  }
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
