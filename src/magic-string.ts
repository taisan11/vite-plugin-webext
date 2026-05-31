import MagicString from 'magic-string'

export type MagicStringMap = ReturnType<MagicString['generateMap']>

export interface MagicStringLike {
  overwrite(start: number, end: number, content: string): unknown
  toString(): string
  generateMap?(options?: { hires?: boolean | 'boundary' }): MagicStringMap | unknown
}

export interface MagicStringOptions {
  magicString?: MagicStringLike
  returnMagicString?: boolean
}

export interface MagicStringResult {
  code: string | MagicStringLike
  map: MagicStringMap | null
}

export function createMagicString(code: string, options: MagicStringOptions = {}): MagicStringLike {
  return options.magicString ?? new MagicString(code)
}

export function finishMagicStringTransform(
  code: string,
  magic: MagicStringLike,
  count: number,
  options: MagicStringOptions = {},
): MagicStringResult {
  if (count === 0) {
    return { code, map: null }
  }

  if (options.returnMagicString) {
    return { code: magic, map: null }
  }

  return {
    code: magic.toString(),
    map: generateMap(magic),
  }
}

function generateMap(magic: MagicStringLike): MagicStringMap | null {
  const map = magic.generateMap?.({ hires: true })
  return map == null ? null : (map as MagicStringMap)
}
