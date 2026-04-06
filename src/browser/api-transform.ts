import MagicString from 'magic-string'

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
  'userScripts',
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
  'userScripts',
] as const

interface AstNode {
  type: string
  start?: number
  end?: number
  computed?: boolean
  object?: unknown
  name?: string
  [key: string]: unknown
}

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
) {
  const ast = parse(code) as AstNode
  const magic = new MagicString(code)
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
    code: count > 0 ? magic.toString() : code,
    map: count > 0 ? magic.generateMap({ hires: true }) : null,
  }
}

function walkAst(node: unknown, visit: (node: AstNode) => void) {
  if (!node || typeof node !== 'object') return

  const astNode = node as AstNode
  if (!astNode.type) return

  visit(astNode)

  for (const value of Object.values(astNode)) {
    if (!value) continue
    if (Array.isArray(value)) {
      for (const item of value) walkAst(item, visit)
      continue
    }
    walkAst(value, visit)
  }
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
