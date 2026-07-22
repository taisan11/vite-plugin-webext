#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { initProject } from './cli/init.ts'

const help = `Usage: vite-plugin-webext <command> [directory]

Commands:
  init [directory]  Create a new WebExtension project (default: .)

Options:
  -h, --help        Show this help
`

async function main(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    process.stdout.write(help)
    return
  }

  const [command, target = '.', ...extra] = positionals
  if (command !== 'init' || extra.length > 0) {
    throw new Error(`Unknown or invalid command.\n\n${help}`)
  }

  const result = await initProject(target)
  process.stdout.write(`Created a WebExtension project in ${result.directory}\n\n`)
  process.stdout.write('Next steps:\n')
  if (target !== '.') process.stdout.write(`  cd ${target}\n`)
  process.stdout.write('  bun install\n')
  process.stdout.write('  bun run dev\n')
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`vite-plugin-webext: ${message}\n`)
  process.exitCode = 1
}
