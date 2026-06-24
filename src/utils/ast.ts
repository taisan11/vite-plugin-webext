export interface AstNode {
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
  specifiers?: AstNode[]
  [key: string]: unknown
}

export function walkAst(node: unknown, visit: (node: AstNode) => void) {
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
