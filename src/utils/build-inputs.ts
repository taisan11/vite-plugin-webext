import path from 'node:path'
import type { Rolldown } from 'vite'

/** Normalize every supported Vite input form before merging it with our entries. */
export function mergeBuildInputs(
  root: string,
  automatic: Record<string, string>,
  ...inputs: Array<Rolldown.InputOption | undefined>
): Record<string, string> {
  const result: Record<string, string> = Object.assign(Object.create(null), automatic)
  for (const input of inputs) {
    if (input == null) continue
    if (typeof input === 'string' || Array.isArray(input)) {
      for (const source of typeof input === 'string' ? [input] : input) {
        const absolute = path.resolve(root, source)
        if (Object.values(result).includes(absolute)) continue
        const basename = path.basename(source, path.extname(source))
        let name = basename
        let suffix = 1
        while (Object.hasOwn(result, name)) name = `${basename}-${suffix++}`
        result[name] = absolute
      }
    } else {
      for (const [name, source] of Object.entries(input)) {
        result[name] = path.resolve(root, source)
      }
    }
  }
  return result
}
