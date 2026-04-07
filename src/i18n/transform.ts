import { promises as fs } from 'node:fs'
import path from 'node:path'
import MagicString from 'magic-string'

const DEFAULT_LOCALE_DIR = 'src/locale'
const DEFAULT_DTS_NAME = 'webext-i18n.d.ts'
const LOCALE_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const I18N_IMPORT_SOURCES = new Set([
  '@taisan11/vite-plugin-webext/i18n',
  '@taisan11/vite-plugin-webext/src/i18n',
])

export interface I18nOptions {
  enabled?: boolean
  localeDir?: string
}

export interface ResolvedI18nOptions {
  enabled: boolean
  localeDir: string
  generatedDtsPath: string
}

interface AstNode {
  type: string
  start?: number
  end?: number
  source?: AstNode
  value?: unknown
  local?: AstNode
  imported?: AstNode
  name?: string
  arguments?: unknown
  callee?: unknown
  object?: unknown
  property?: unknown
  computed?: boolean
  expressions?: unknown[]
  quasis?: AstNode[]
  [key: string]: unknown
}

interface RewriteI18nResult {
  count: number
  unknownIds: string[]
  code: string
  map: ReturnType<MagicString['generateMap']> | null
}

export function resolveI18nOptions(i18n?: boolean | I18nOptions): ResolvedI18nOptions {
  if (i18n === false || i18n == null) {
    return {
      enabled: false,
      localeDir: DEFAULT_LOCALE_DIR,
      generatedDtsPath: normalizePath(path.join(DEFAULT_LOCALE_DIR, DEFAULT_DTS_NAME)),
    }
  }

  if (i18n === true) {
    return {
      enabled: true,
      localeDir: DEFAULT_LOCALE_DIR,
      generatedDtsPath: normalizePath(path.join(DEFAULT_LOCALE_DIR, DEFAULT_DTS_NAME)),
    }
  }

  const localeDir = normalizePath(i18n.localeDir?.trim() || DEFAULT_LOCALE_DIR)
  return {
    enabled: i18n.enabled ?? true,
    localeDir,
    generatedDtsPath: normalizePath(path.join(localeDir, DEFAULT_DTS_NAME)),
  }
}

export async function prepareI18nArtifacts(
  rootDir: string,
  options: ResolvedI18nOptions,
): Promise<{ messageIds: Set<string> }> {
  const localeDir = path.resolve(rootDir, options.localeDir)
  const localeFiles = await readLocaleFiles(localeDir)
  if (localeFiles.length === 0) {
    throw new Error(
      `[vite-plugin-webext] i18n is enabled, but no locale source files were found in "${options.localeDir}". ` +
        'Create src/locale/[localeName].ts and export defineLocale({...}).',
    )
  }

  const messageIds = new Set<string>()
  for (const filePath of localeFiles) {
    const source = await fs.readFile(filePath, 'utf8')
    for (const id of extractDefineLocaleMessageIds(source)) {
      messageIds.add(id)
    }
  }

  const generatedDtsPath = path.resolve(rootDir, options.generatedDtsPath)
  await fs.mkdir(path.dirname(generatedDtsPath), { recursive: true })
  await fs.writeFile(generatedDtsPath, renderLocaleMessageIdDts(messageIds))

  return { messageIds }
}

export function rewriteI18nTCalls(
  code: string,
  parse: (source: string) => unknown,
  messageIds: Set<string>,
): RewriteI18nResult {
  if (!hasI18nImport(code)) {
    return { count: 0, unknownIds: [], code, map: null }
  }

  const ast = parse(code) as AstNode
  const callTargets = collectImportedTCallTargets(ast)
  if (callTargets.direct.size === 0 && callTargets.namespaces.size === 0) {
    return { count: 0, unknownIds: [], code, map: null }
  }

  const magic = new MagicString(code)
  let count = 0
  const unknownIds = new Set<string>()

  walkAst(ast, (node) => {
    if (node.type !== 'CallExpression') return
    if (!isTCallExpression(node, callTargets)) return

    const args = (Array.isArray(node.arguments) ? node.arguments : []) as AstNode[]
    if (args.length === 0) return
    const firstArg = args[0]
    if (!firstArg) return
    const messageId = getStaticMessageId(firstArg)
    if (!messageId) return
    if (messageIds.size > 0 && !messageIds.has(messageId)) {
      unknownIds.add(messageId)
    }

    const callStart = node.start
    const callEnd = node.end
    if (typeof callStart !== 'number' || typeof callEnd !== 'number') return

    const serializedArgs = args
      .map((arg) => {
        if (typeof arg.start !== 'number' || typeof arg.end !== 'number') return ''
        return code.slice(arg.start, arg.end)
      })
      .filter((arg) => arg.length > 0)
      .join(', ')

    magic.overwrite(callStart, callEnd, `browser.i18n.getMessage(${serializedArgs})`)
    count++
  })

  return {
    count,
    unknownIds: [...unknownIds].sort(),
    code: count > 0 ? magic.toString() : code,
    map: count > 0 ? magic.generateMap({ hires: true }) : null,
  }
}

function hasI18nImport(code: string): boolean {
  return code.includes('vite-plugin-webext/i18n')
}

function collectImportedTCallTargets(ast: AstNode): {
  direct: Set<string>
  namespaces: Set<string>
} {
  const direct = new Set<string>()
  const namespaces = new Set<string>()

  walkAst(ast, (node) => {
    if (node.type !== 'ImportDeclaration') return
    const source = node.source as AstNode | undefined
    if (typeof source?.value !== 'string' || !I18N_IMPORT_SOURCES.has(source.value)) return

    const specifiers = Array.isArray(node.specifiers) ? (node.specifiers as AstNode[]) : []
    for (const specifier of specifiers) {
      if (specifier.type === 'ImportSpecifier') {
        const imported = specifier.imported as AstNode | undefined
        const local = specifier.local as AstNode | undefined
        if (imported?.name === 't' && typeof local?.name === 'string') {
          direct.add(local.name)
        }
      }
      if (specifier.type === 'ImportNamespaceSpecifier') {
        const local = specifier.local as AstNode | undefined
        if (typeof local?.name === 'string') {
          namespaces.add(local.name)
        }
      }
    }
  })

  return { direct, namespaces }
}

function isTCallExpression(
  node: AstNode,
  callTargets: { direct: Set<string>; namespaces: Set<string> },
): boolean {
  const callee = node.callee as AstNode | undefined
  if (!callee) return false

  if (callee.type === 'Identifier' && typeof callee.name === 'string') {
    return callTargets.direct.has(callee.name)
  }

  if ((callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && !callee.computed) {
    const object = callee.object as AstNode | undefined
    const property = callee.property as AstNode | undefined
    return (
      object?.type === 'Identifier' &&
      typeof object.name === 'string' &&
      callTargets.namespaces.has(object.name) &&
      property?.type === 'Identifier' &&
      property.name === 't'
    )
  }

  return false
}

function getStaticMessageId(node: AstNode): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type !== 'TemplateLiteral') return null

  const expressions = Array.isArray(node.expressions) ? node.expressions : []
  if (expressions.length !== 0) return null
  const quasis = Array.isArray(node.quasis) ? node.quasis : []
  const first = quasis[0] as { value?: { cooked?: unknown } } | undefined
  return typeof first?.value?.cooked === 'string' ? first.value.cooked : null
}

function walkAst(node: unknown, visit: (node: AstNode) => void) {
  if (!node || typeof node !== 'object') return
  const astNode = node as AstNode
  if (!astNode.type) return

  visit(astNode)

  for (const value of Object.values(astNode)) {
    if (!value) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        walkAst(item, visit)
      }
      continue
    }
    walkAst(value, visit)
  }
}

async function readLocaleFiles(localeDir: string): Promise<string[]> {
  let entries: Array<{ name: string; isFile: () => boolean }>
  try {
    entries = (await fs.readdir(localeDir, {
      withFileTypes: true,
      encoding: 'utf8',
    })) as Array<{ name: string; isFile: () => boolean }>
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException
    if (maybeError.code === 'ENOENT') return []
    throw error
  }

  const results: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const extension = path.extname(entry.name)
    if (!LOCALE_SOURCE_EXTENSIONS.has(extension)) continue
    if (entry.name.endsWith('.d.ts')) continue
    const filePath = path.join(localeDir, entry.name)
    results.push(filePath)
  }

  return results.sort((a, b) => a.localeCompare(b))
}

function extractDefineLocaleMessageIds(source: string): Set<string> {
  const ids = new Set<string>()
  let searchIndex = 0
  while (searchIndex < source.length) {
    const defineLocaleIndex = source.indexOf('defineLocale', searchIndex)
    if (defineLocaleIndex === -1) break

    const parenIndex = source.indexOf('(', defineLocaleIndex)
    if (parenIndex === -1) break
    const objectStart = findNextNonSpaceIndex(source, parenIndex + 1)
    if (objectStart === -1 || source[objectStart] !== '{') {
      searchIndex = parenIndex + 1
      continue
    }

    const objectEnd = findMatchingBrace(source, objectStart)
    if (objectEnd === -1) {
      searchIndex = objectStart + 1
      continue
    }

    const objectText = source.slice(objectStart + 1, objectEnd)
    for (const key of extractTopLevelObjectLiteralKeys(objectText)) {
      ids.add(key)
    }
    searchIndex = objectEnd + 1
  }

  return ids
}

function extractTopLevelObjectLiteralKeys(source: string): string[] {
  const keys: string[] = []
  const properties = splitTopLevelObjectProperties(source)
  for (const property of properties) {
    const key = parseObjectPropertyKey(property)
    if (key) {
      keys.push(key)
    }
  }
  return keys
}

function splitTopLevelObjectProperties(source: string): string[] {
  const properties: string[] = []
  let inString: '"' | "'" | '`' | null = null
  let escaped = false
  let inLineComment = false
  let inBlockComment = false
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0
  let segmentStart = 0

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char
      continue
    }

    if (char === '{') {
      braceDepth++
      continue
    }
    if (char === '}') {
      braceDepth--
      continue
    }
    if (char === '[') {
      bracketDepth++
      continue
    }
    if (char === ']') {
      bracketDepth--
      continue
    }
    if (char === '(') {
      parenDepth++
      continue
    }
    if (char === ')') {
      parenDepth--
      continue
    }

    const isTopLevel = braceDepth === 0 && bracketDepth === 0 && parenDepth === 0
    if (isTopLevel && char === ',') {
      const property = source.slice(segmentStart, i).trim()
      if (property) properties.push(property)
      segmentStart = i + 1
    }
  }

  const lastProperty = source.slice(segmentStart).trim()
  if (lastProperty) properties.push(lastProperty)
  return properties
}

function parseObjectPropertyKey(property: string): string | null {
  if (property.startsWith('...')) return null
  const colonIndex = findTopLevelColonIndex(property)
  if (colonIndex === -1) return null

  const rawKey = property.slice(0, colonIndex).trim()
  if (!rawKey || rawKey.startsWith('[')) return null

  if (/^[A-Za-z_$][\w$]*$/.test(rawKey)) return rawKey
  if (/^\d+$/.test(rawKey)) return rawKey

  if (rawKey.length >= 2) {
    const quote = rawKey[0]
    const endQuote = rawKey[rawKey.length - 1]
    if ((quote === '"' || quote === "'" || quote === '`') && endQuote === quote) {
      const body = rawKey.slice(1, -1)
      return unescapeQuotedKey(body)
    }
  }

  return null
}

function findTopLevelColonIndex(source: string): number {
  let inString: '"' | "'" | '`' | null = null
  let escaped = false
  let inLineComment = false
  let inBlockComment = false
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char
      continue
    }

    if (char === '{') {
      braceDepth++
      continue
    }
    if (char === '}') {
      braceDepth--
      continue
    }
    if (char === '[') {
      bracketDepth++
      continue
    }
    if (char === ']') {
      bracketDepth--
      continue
    }
    if (char === '(') {
      parenDepth++
      continue
    }
    if (char === ')') {
      parenDepth--
      continue
    }

    if (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0 && char === ':') {
      return i
    }
  }

  return -1
}

function unescapeQuotedKey(value: string): string {
  return value
    .replace(/\\(['"`\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
}

function findNextNonSpaceIndex(source: string, fromIndex: number): number {
  for (let i = fromIndex; i < source.length; i++) {
    const char = source[i]
    if (!char) break
    if (!/\s/.test(char)) return i
  }
  return -1
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0
  let inString: '"' | "'" | '`' | null = null
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = openIndex; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char
      continue
    }

    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) return i
    }
  }

  return -1
}

function renderLocaleMessageIdDts(messageIds: Set<string>): string {
  const lines = [...messageIds]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => `    ${JSON.stringify(id)}: true`)

  return (
    '// Auto-generated by vite-plugin-webext. Do not edit.\n' +
    'declare global {\n' +
    '  interface WebextI18nMessageIdMap {\n' +
    `${lines.join('\n')}${lines.length > 0 ? '\n' : ''}` +
    '  }\n' +
    '}\n' +
    'export {}\n'
  )
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}
