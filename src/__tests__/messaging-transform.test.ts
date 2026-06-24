import { describe, it, expect } from 'vitest'
import { rewriteMessagingCalls } from '../messaging/transform.ts'

describe('rewriteMessagingCalls', () => {
  it('should return unchanged code when no messaging import', () => {
    const code = 'console.log("hello")'
    const result = rewriteMessagingCalls(code, (s) => ({ type: 'Program', body: [] }))
    expect(result.count).toBe(0)
    expect(result.code).toBe(code)
  })

  it('should return count 0 for empty call targets', () => {
    const code = 'import { sendMessage } from "vite-plugin-webext/messaging"'
    const result = rewriteMessagingCalls(code, (s) => ({
      type: 'Program',
      body: [{
        type: 'ImportDeclaration',
        source: { value: 'vite-plugin-webext/messaging' },
        specifiers: [{
          type: 'ImportSpecifier',
          imported: { name: 'sendMessage' },
          local: { name: 'sendMessage' },
        }],
      }],
    }))
    expect(result.count).toBe(0)
  })
})
