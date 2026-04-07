export interface MessageContract<Request = unknown, Response = unknown> {
  request: Request
  response: Response
}

declare global {
  interface WebextMessageMap {}
}

type KnownMessageType = keyof WebextMessageMap & string

export type MessageType = [KnownMessageType] extends [never] ? string : KnownMessageType
type ResolvedMessageContract<T extends MessageType> = T extends keyof WebextMessageMap
  ? WebextMessageMap[T]
  : MessageContract

export type MessageRequest<T extends MessageType> =
  ResolvedMessageContract<T> extends MessageContract<infer Request, unknown> ? Request : unknown
export type MessageResponse<T extends MessageType> =
  ResolvedMessageContract<T> extends MessageContract<unknown, infer Response> ? Response : unknown

export interface TypedMessage<T extends MessageType = MessageType> {
  type: T
  payload: MessageRequest<T>
}

interface RuntimeNamespace {
  sendMessage(message: unknown, options?: unknown): Promise<unknown>
}

interface TabsNamespace {
  sendMessage(tabId: number, message: unknown, options?: unknown): Promise<unknown>
}

interface BrowserLike {
  runtime?: RuntimeNamespace
  tabs?: TabsNamespace
}

export function createMessage<T extends MessageType>(
  type: T,
  payload: MessageRequest<T>,
): TypedMessage<T> {
  return { type, payload }
}

export function sendMessage<T extends MessageType>(
  type: T,
  payload: MessageRequest<T>,
  options?: unknown,
): Promise<MessageResponse<T>> {
  return resolveRuntimeNamespace().sendMessage({ type, payload }, options) as Promise<
    MessageResponse<T>
  >
}

export function sendMessageToTab<T extends MessageType>(
  tabId: number,
  type: T,
  payload: MessageRequest<T>,
  options?: unknown,
): Promise<MessageResponse<T>> {
  return resolveTabsNamespace().sendMessage(tabId, { type, payload }, options) as Promise<
    MessageResponse<T>
  >
}

function resolveRuntimeNamespace(): RuntimeNamespace {
  const runtime = resolveExtensionApi().runtime
  if (!runtime) {
    throw new Error(
      '[vite-plugin-webext] Could not resolve browser.runtime namespace for messaging helpers.',
    )
  }
  return runtime
}

function resolveTabsNamespace(): TabsNamespace {
  const tabs = resolveExtensionApi().tabs
  if (!tabs) {
    throw new Error(
      '[vite-plugin-webext] Could not resolve browser.tabs namespace for messaging helpers.',
    )
  }
  return tabs
}

function resolveExtensionApi(): BrowserLike {
  const extensionApi = globalThis as typeof globalThis & {
    browser?: BrowserLike
    chrome?: BrowserLike
  }
  return extensionApi.browser ?? extensionApi.chrome ?? {}
}

