import path from 'node:path'
import MagicString from 'magic-string'
import { rolldown, type OutputBundle, type OutputChunk } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import { walkAst, type AstNode } from './utils/ast.ts'
import type { BrowserTarget } from './index.ts'

/** Inline rendered dependencies of extension scripts, leaving Vite's HTML graph alone. */
export async function bundleStandaloneScripts(
  bundle: OutputBundle,
  scripts: Map<string, 'classic' | 'module'>,
  browser: BrowserTarget,
  sourcemap: boolean | 'inline' | 'hidden',
  minify: boolean,
) {
  // Always load the original graph: compiling one entry must not affect another.
  const chunks = new Map(Object.values(bundle)
    .filter((output): output is OutputChunk => output.type === 'chunk')
    .map((chunk) => [chunk.fileName, { ...chunk }]))
  const prefix = '\0webext-output:'
  for (const [fileName, kind] of scripts) {
    const chunk = bundle[fileName]
    if (!chunk || chunk.type !== 'chunk') throw new Error(`[vite-plugin-webext] Missing script output "${fileName}".`)
    const build = await rolldown({
      input: prefix + fileName,
      preserveEntrySignatures: false,
      treeshake: false,
      plugins: [{
        name: 'webext:rendered-scripts',
        resolveId(source, importer) {
          if (source.startsWith(prefix)) return source
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(importer!.slice(prefix.length)), source))
          if (chunks.has(target)) return prefix + target
          throw new Error(`[vite-plugin-webext] Standalone script "${fileName}" has an unresolved import "${source}".`)
        },
        load(id) {
          const original = id.slice(prefix.length)
          const source = chunks.get(original)!
          return { code: source.code, map: source.map }
        },
        transform(code, id) {
          const original = id.slice(prefix.length)
          if (!code.includes('import.meta') || (kind === 'module' && original === fileName)) return null
          const magic = new MagicString(code)
          const relative = path.posix.relative(path.posix.dirname(fileName), original)
          walkAst(parseSync(original, code).program, (node: AstNode) => {
            const object = node.object as AstNode | undefined
            const property = node.property as AstNode | undefined
            if (node.type !== 'MemberExpression' || object?.type !== 'MetaProperty' || property?.name !== 'url') return
            const meta = object.meta as AstNode | undefined
            if (meta?.name !== 'import' || typeof node.start !== 'number' || typeof node.end !== 'number') return
            const replacement = kind === 'classic'
              ? `${browser}.runtime.getURL(${JSON.stringify(original)})`
              : `new URL(${JSON.stringify(relative)}, import.meta.url).href`
            magic.overwrite(node.start, node.end, replacement)
          })
          return { code: magic.toString(), map: magic.generateMap({ hires: true }) }
        },
      }],
    })
    try {
      const generated = await build.generate({
        format: kind === 'classic' ? 'iife' : 'es',
        codeSplitting: false,
        entryFileNames: fileName,
        sourcemap,
        minify,
      })
      const entry = generated.output.find((output): output is OutputChunk => output.type === 'chunk')!
      chunk.code = entry.code
      chunk.map = entry.map
      chunk.imports = entry.imports
      chunk.dynamicImports = entry.dynamicImports
      chunk.sourcemapFileName = entry.sourcemapFileName
      for (const output of generated.output) {
        if (output.type === 'asset') bundle[output.fileName] = output
      }
    } finally {
      await build.close()
    }
  }
}
