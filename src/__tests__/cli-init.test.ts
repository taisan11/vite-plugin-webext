import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initProject } from '../cli/init.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })))
})

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-webext-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('initProject', () => {
  it('creates a starter project in the target directory', async () => {
    const cwd = await temporaryDirectory()

    const result = await initProject('my-extension', cwd)
    const packageJson = JSON.parse(await fs.readFile(path.join(result.directory, 'package.json'), 'utf8'))

    expect(packageJson.name).toBe('my-extension')
    expect(packageJson.devDependencies['@taisan11/vite-plugin-webext']).toBe('^0.4.0')
    expect(result.files).toContain('vite.config.ts')
    await expect(fs.readFile(path.join(result.directory, 'src/popup/index.html'), 'utf8')).resolves.toContain(
      '<h1>my-extension</h1>',
    )
  })

  it('does not overwrite existing files', async () => {
    const cwd = await temporaryDirectory()
    await fs.writeFile(path.join(cwd, 'package.json'), '{"private":true}\n')

    await expect(initProject('.', cwd)).rejects.toThrow('Refusing to overwrite existing files')
    await expect(fs.readFile(path.join(cwd, 'package.json'), 'utf8')).resolves.toBe('{"private":true}\n')
    await expect(fs.access(path.join(cwd, 'vite.config.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
