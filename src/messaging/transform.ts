import MagicString from 'magic-string'

const MESSAGING_IMPORT_SOURCES = new Set([
  '@taisan11/vite-plugin-webext/messaging',
  '@taisan11/vite-plugin-webext/src/messaging',
])

type MessagingOperation = 'runtime' | 'tabs'

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
  [key: string]: unknown
}

interface RewriteMessagingResult {
  count: number
  code: string
  map: ReturnType<MagicString['generateMap']> | null
}

export function rewriteMessagingCalls(code: string, parse: (source: string) => unknown): RewriteMessagingResult {
  if (!hasMessagingImport(code)) {
    return { count: 0, code, map: null }
  }

  const ast = parse(code) as AstNode
  const callTargets = collectImportedMessagingCallTargets(ast)
  if (callTargets.direct.size === 0 && callTargets.namespaces.size === 0) {
    return { count: 0, code, map: null }
  }

  const magic = new MagicString(code)
  let count = 0

  walkAst(ast, (node) => {
    if (node.type !== 'CallExpression') return

    const operation = resolveMessagingOperation(node, callTargets)
    if (!operation) return

    const args = (Array.isArray(node.arguments) ? node.arguments : []) as AstNode[]
    const replacement = renderMessagingReplacement(operation, args, code)
    if (!replacement) return

    if (typeof node.start !== 'number' || typeof node.end !== 'number') return
    magic.overwrite(node.start, node.end, replacement)
    count++
  })

  return {
    count,
    code: count > 0 ? magic.toString() : code,
    map: count > 0 ? magic.generateMap({ hires: true }) : null,
  }
}

function hasMessagingImport(code: string): boolean {
  return code.includes('vite-plugin-webext/messaging')
}

function collectImportedMessagingCallTargets(ast: AstNode): {
  direct: Map<string, MessagingOperation>
  namespaces: Set<string>
} {
  const direct = new Map<string, MessagingOperation>()
  const namespaces = new Set<string>()

  walkAst(ast, (node) => {
    if (node.type !== 'ImportDeclaration') return
    const source = node.source as AstNode | undefined
    if (typeof source?.value !== 'string' || !MESSAGING_IMPORT_SOURCES.has(source.value)) return

    const specifiers = Array.isArray(node.specifiers) ? (node.specifiers as AstNode[]) : []
    for (const specifier of specifiers) {
      if (specifier.type === 'ImportSpecifier') {
        const imported = specifier.imported as AstNode | undefined
        const local = specifier.local as AstNode | undefined
        if (typeof local?.name !== 'string') continue
        if (imported?.name === 'sendMessage') {
          direct.set(local.name, 'runtime')
          continue
        }
        if (imported?.name === 'sendMessageToTab') {
          direct.set(local.name, 'tabs')
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

function resolveMessagingOperation(
  node: AstNode,
  callTargets: {
    direct: Map<string, MessagingOperation>
    namespaces: Set<string>
  },
): MessagingOperation | null {
  const callee = node.callee as AstNode | undefined
  if (!callee) return null

  if (callee.type === 'Identifier' && typeof callee.name === 'string') {
    return callTargets.direct.get(callee.name) ?? null
  }

  if ((callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && !callee.computed) {
    const object = callee.object as AstNode | undefined
    const property = callee.property as AstNode | undefined
    if (
      object?.type !== 'Identifier' ||
      typeof object.name !== 'string' ||
      !callTargets.namespaces.has(object.name) ||
      property?.type !== 'Identifier'
    ) {
      return null
    }

    if (property.name === 'sendMessage') return 'runtime'
    if (property.name === 'sendMessageToTab') return 'tabs'
  }

  return null
}

function renderMessagingReplacement(
  operation: MessagingOperation,
  args: AstNode[],
  code: string,
): string | null {
  if (operation === 'runtime') {
    const typeArg = args[0]
    const payloadArg = args[1]
    if (!typeArg || !payloadArg) return null
    if (typeArg.type === 'SpreadElement' || payloadArg.type === 'SpreadElement') return null

    const typeSource = sliceNode(code, typeArg)
    const payloadSource = sliceNode(code, payloadArg)
    if (!typeSource || !payloadSource) return null

    const optionsSource = args[2] ? sliceNode(code, args[2]) : ''
    if (args[2] && !optionsSource) return null

    const messageObject = `{ type: ${typeSource}, payload: ${payloadSource} }`
    return optionsSource
      ? `browser.runtime.sendMessage(${messageObject}, ${optionsSource})`
      : `browser.runtime.sendMessage(${messageObject})`
  }

  const tabIdArg = args[0]
  const typeArg = args[1]
  const payloadArg = args[2]
  if (!tabIdArg || !typeArg || !payloadArg) return null
  if (tabIdArg.type === 'SpreadElement' || typeArg.type === 'SpreadElement' || payloadArg.type === 'SpreadElement') {
    return null
  }

  const tabIdSource = sliceNode(code, tabIdArg)
  const typeSource = sliceNode(code, typeArg)
  const payloadSource = sliceNode(code, payloadArg)
  if (!tabIdSource || !typeSource || !payloadSource) return null

  const optionsSource = args[3] ? sliceNode(code, args[3]) : ''
  if (args[3] && !optionsSource) return null

  const messageObject = `{ type: ${typeSource}, payload: ${payloadSource} }`
  return optionsSource
    ? `browser.tabs.sendMessage(${tabIdSource}, ${messageObject}, ${optionsSource})`
    : `browser.tabs.sendMessage(${tabIdSource}, ${messageObject})`
}

function sliceNode(code: string, node: AstNode): string {
  if (typeof node.start !== 'number' || typeof node.end !== 'number') return ''
  return code.slice(node.start, node.end)
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

