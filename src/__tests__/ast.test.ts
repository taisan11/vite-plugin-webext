import { describe, it, expect } from 'vitest'
import { walkAst, type AstNode } from '../utils/ast.ts'

describe('walkAst', () => {
  it('should visit all nodes in the AST', () => {
    const ast: AstNode = {
      type: 'Program',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: 'foo',
              start: 0,
              end: 3,
            },
            arguments: [],
          },
        },
      ],
    }

    const visited: string[] = []
    walkAst(ast, (node) => {
      visited.push(node.type)
    })

    expect(visited).toContain('Program')
    expect(visited).toContain('ExpressionStatement')
    expect(visited).toContain('CallExpression')
    expect(visited).toContain('Identifier')
  })

  it('should handle null/undefined nodes', () => {
    const visited: string[] = []
    walkAst(null, (node) => {
      visited.push(node.type)
    })
    walkAst(undefined, (node) => {
      visited.push(node.type)
    })
    expect(visited).toHaveLength(0)
  })

  it('should handle nodes without type property', () => {
    const visited: string[] = []
    walkAst({ foo: 'bar' }, (node) => {
      visited.push(node.type)
    })
    expect(visited).toHaveLength(0)
  })

  it('should visit nested array items', () => {
    const ast: AstNode = {
      type: 'Program',
      body: [
        { type: 'Statement1' },
        { type: 'Statement2' },
      ],
    }

    const visited: string[] = []
    walkAst(ast, (node) => {
      visited.push(node.type)
    })

    expect(visited).toContain('Program')
    expect(visited).toContain('Statement1')
    expect(visited).toContain('Statement2')
  })
})
