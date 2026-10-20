import { build, type Plugin, type PluginOption, type ViteDevServer } from 'vite'

export interface DevBuildWatcher {
  close(): Promise<void>
}

/** Keep extension resources on disk; a browser cannot load remote MV3 scripts. */
export async function startDevBuild(
  server: ViteDevServer,
  plugin: Plugin,
  createPlugin: () => Plugin,
): Promise<DevBuildWatcher> {
  // Inline configurations may reuse the serving plugin instance. The build
  // needs its own state, just as when Vite reloads a config file for a build.
  async function replacePlugin(option: PluginOption): Promise<PluginOption> {
    const resolved = await option
    if (Array.isArray(resolved)) return Promise.all(resolved.map(replacePlugin))
    return resolved === plugin ? createPlugin() : resolved
  }

  const { config } = server
  const result = await build({
    ...config.inlineConfig,
    configFile: config.configFile ?? false,
    root: config.root,
    mode: config.mode,
    plugins: await Promise.all((config.inlineConfig.plugins ?? []).map(replacePlugin)),
    build: {
      ...config.inlineConfig.build,
      watch: config.build.watch || {},
      write: true,
      minify: false,
    },
  })
  if (!('on' in result)) {
    throw new Error('[vite-plugin-webext] Expected a watch build in development mode.')
  }

  try {
    await new Promise<void>((resolve, reject) => {
      result.on('event', (event) => {
        if (event.code === 'ERROR') reject(event.error)
        if (event.code === 'END') resolve()
      })
    })
  } catch (error) {
    await result.close()
    throw error
  }

  return result
}
