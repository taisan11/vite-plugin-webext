import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { normalizePath } from '../utils/path.ts'

describe('normalizePath', () => {
  it('should convert platform-specific separators to forward slashes', () => {
    // On macOS/Linux, path.sep is '/' so no conversion needed
    // On Windows, path.sep is '\' so backslashes should be converted
    if (path.sep === '\\') {
      expect(normalizePath('src\\index.ts')).toBe('src/index.ts')
      expect(normalizePath('path\\to\\file.js')).toBe('path/to/file.js')
    } else {
      expect(normalizePath('src/index.ts')).toBe('src/index.ts')
      expect(normalizePath('path/to/file.js')).toBe('path/to/file.js')
    }
  })

  it('should leave forward slashes unchanged', () => {
    expect(normalizePath('src/index.ts')).toBe('src/index.ts')
    expect(normalizePath('path/to/file.js')).toBe('path/to/file.js')
  })

  it('should handle empty string', () => {
    expect(normalizePath('')).toBe('')
  })

  it('should handle current platform paths', () => {
    const testPath = ['src', 'sub', 'file.ts'].join(path.sep)
    expect(normalizePath(testPath)).toBe('src/sub/file.ts')
  })
})
