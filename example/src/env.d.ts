/// <reference types="../../src/webext-types.d.ts" />

export {}

declare global {
  interface WebextMessageMap {
    getCount: { request: { key: string }; response: { count: number } }
  }
}
