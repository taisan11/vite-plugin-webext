export interface InjectScriptOptions {
  /** Keep the injected script element in the page DOM after it loads. */
  keepInDom?: boolean
  /** Modify the script element before it is appended to the page. */
  modifyScript?: (script: InjectedScriptElement) => void | Promise<void>
}

export interface InjectedScriptElement {
  src: string
  type: string
  onload: (() => void) | null
  onerror: (() => void) | null
  remove?: () => void
  [key: string]: unknown
}

export interface InjectScriptResult {
  script: InjectedScriptElement
}

export interface UnlistedScriptDefinition {
  main: () => unknown
}

/** Define the entrypoint body of an unlisted script. */
export function defineUnlistedScript(
  main: (() => unknown) | UnlistedScriptDefinition,
): UnlistedScriptDefinition {
  const definition = typeof main === 'function' ? { main } : main
  definition.main()
  return definition
}

interface RuntimeLike {
  getURL?: (path: string) => string
}

interface DocumentLike {
  createElement(tagName: string): InjectedScriptElement
  head?: { appendChild(node: InjectedScriptElement): void }
  documentElement?: { appendChild(node: InjectedScriptElement): void }
}

/**
 * Inject a configured unlisted script into the page's main world.
 *
 * The argument is the unlisted script name configured in `webext`, with the
 * generated `.js` suffix optional.
 */
export async function injectScript(
  name: string,
  options: InjectScriptOptions = {},
): Promise<InjectScriptResult> {
  const extensionApi = globalThis as typeof globalThis & {
    browser?: { runtime?: RuntimeLike }
    chrome?: { runtime?: RuntimeLike }
    document?: DocumentLike
  }
  const runtime = extensionApi.browser?.runtime ?? extensionApi.chrome?.runtime
  const document = extensionApi.document

  if (!runtime?.getURL) {
    throw new Error('[vite-plugin-webext] Could not resolve browser.runtime.getURL for `injectScript(...)`.')
  }
  if (!document) {
    throw new Error('[vite-plugin-webext] `injectScript(...)` must be called from a content script.')
  }

  const scriptPath = name.endsWith('.js') ? name : `${name}.js`
  const script = document.createElement('script')
  script.src = runtime.getURL(scriptPath)
  script.type = 'module'

  if (options.modifyScript) await options.modifyScript(script)

  return new Promise((resolve, reject) => {
    script.onload = () => {
      if (!options.keepInDom) script.remove?.()
      resolve({ script })
    }
    script.onerror = () => reject(new Error(`[vite-plugin-webext] Failed to inject script "${name}".`))
    const parent = document.head ?? document.documentElement
    if (!parent) {
      reject(new Error('[vite-plugin-webext] Could not find a document element for `injectScript(...)`.'))
      return
    }
    parent.appendChild(script)
  })
}
