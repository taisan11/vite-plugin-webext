import { describe, it, expect } from 'vitest'
import {
  hasApiNamespaceAccess,
  hasUnavailableApiAccess,
  resolveApiNamespace,
  rewriteApiNamespaces,
  CHROME_ONLY_APIS,
  FIREFOX_ONLY_APIS,
} from '../browser/api-transform.ts'

describe('hasApiNamespaceAccess', () => {
  it('should detect browser namespace access', () => {
    expect(hasApiNamespaceAccess('browser.runtime.sendMessage()')).toBe(true)
    expect(hasApiNamespaceAccess('browser?.runtime.sendMessage()')).toBe(true)
  })

  it('should detect chrome namespace access', () => {
    expect(hasApiNamespaceAccess('chrome.runtime.sendMessage()')).toBe(true)
  })

  it('should return false for no namespace access', () => {
    expect(hasApiNamespaceAccess('console.log("hello")')).toBe(false)
    expect(hasApiNamespaceAccess('const x = 1')).toBe(false)
  })
})

describe('hasUnavailableApiAccess', () => {
  it('should detect specific API access', () => {
    expect(hasUnavailableApiAccess('browser.offscreen', 'offscreen')).toBe(true)
    expect(hasUnavailableApiAccess('chrome.theme', 'theme')).toBe(true)
  })

  it('should return false for no specific API access', () => {
    expect(hasUnavailableApiAccess('browser.runtime', 'offscreen')).toBe(false)
  })
})

describe('resolveApiNamespace', () => {
  it('should return chrome for chrome target', () => {
    expect(resolveApiNamespace('chrome')).toBe('chrome')
  })

  it('should return browser for firefox target', () => {
    expect(resolveApiNamespace('firefox')).toBe('browser')
  })
})

describe('rewriteApiNamespaces', () => {
  function parse(source: string): unknown {
    // Simple mock parser that returns a minimal AST structure
    return {
      type: 'Program',
      body: [],
    }
  }

  it('should have no overlapping APIs between chrome-only and firefox-only lists', () => {
    const chromeSet = new Set<string>(CHROME_ONLY_APIS)
    const firefoxSet = new Set<string>(FIREFOX_ONLY_APIS)
    for (const api of chromeSet) {
      expect(firefoxSet.has(api)).toBe(false)
    }
    for (const api of firefoxSet) {
      expect(chromeSet.has(api)).toBe(false)
    }
  })
})
