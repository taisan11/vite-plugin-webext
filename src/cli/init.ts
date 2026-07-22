import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface InitProjectResult {
  directory: string
  files: string[]
}

function projectName(directory: string): string {
  const name = path.basename(directory).toLowerCase()
  const normalized = name
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')

  return normalized || 'webext-app'
}

function templateFiles(directory: string): Record<string, string> {
  const name = projectName(directory)

  return {
    '.gitignore': 'dist\nnode_modules\n',
    'package.json': `${JSON.stringify(
      {
        name,
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite build --watch --mode chrome',
          'dev:chrome': 'vite build --watch --mode chrome',
          'dev:firefox': 'vite build --watch --mode firefox',
          'build:chrome': 'vite build --mode chrome',
          'build:firefox': 'vite build --mode firefox',
        },
        devDependencies: {
          '@types/chrome': '^0.2.2',
          '@taisan11/vite-plugin-webext': 'latest',
          typescript: '^7.0.2',
          vite: '^8.1.5',
        },
      },
      null,
      2,
    )}\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          lib: ['ESNext', 'DOM', 'DOM.Iterable'],
          module: 'Preserve',
          moduleResolution: 'bundler',
          strict: true,
          noEmit: true,
          types: ['@types/chrome'],
        },
        include: ['src', 'vite.config.ts'],
      },
      null,
      2,
    )}\n`,
    'vite.config.ts': `import { defineConfig } from 'vite'
import { webext } from '@taisan11/vite-plugin-webext'

export default defineConfig({
  plugins: [
    webext({
      defaultBrowser: 'chrome',
      manifest: {
        manifest_version: 3,
        name: '${name}',
        version: '0.0.0',
        background: {
          service_worker: 'src/background.ts',
          type: 'module',
        },
        action: {
          default_popup: 'src/popup/index.html',
        },
      },
    }),
  ],
})
`,
    'src/env.d.ts': '/// <reference types="@taisan11/vite-plugin-webext/types" />\n',
    'src/background.ts': `browser.runtime.onInstalled.addListener(() => {
  console.log('${name} installed')
})
`,
    'src/popup/index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <main>
      <h1>${name}</h1>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`,
    'src/popup/main.ts': "console.log('Popup ready')\n",
  }
}

export async function initProject(target: string, cwd = process.cwd()): Promise<InitProjectResult> {
  const directory = path.resolve(cwd, target)
  const files = templateFiles(directory)
  const conflicts: string[] = []

  for (const relativePath of Object.keys(files)) {
    try {
      await fs.access(path.join(directory, relativePath))
      conflicts.push(relativePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Refusing to overwrite existing files:\n${conflicts.map((file) => `  - ${file}`).join('\n')}`,
    )
  }

  for (const [relativePath, contents] of Object.entries(files)) {
    const outputPath = path.join(directory, relativePath)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, contents, { flag: 'wx' })
  }

  return { directory, files: Object.keys(files) }
}
