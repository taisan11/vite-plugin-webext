//#region src/messaging/index.d.ts
interface MessageContract<Request = unknown, Response = unknown> {
  request: Request;
  response: Response;
}
declare global {
  interface WebextMessageMap {}
}
type KnownMessageType = keyof WebextMessageMap & string;
type MessageType = [KnownMessageType] extends [never] ? string : KnownMessageType;
type ResolvedMessageContract<T extends MessageType> = T extends keyof WebextMessageMap ? WebextMessageMap[T] : MessageContract;
type MessageRequest<T extends MessageType> = ResolvedMessageContract<T> extends MessageContract<infer Request, unknown> ? Request : unknown;
type MessageResponse<T extends MessageType> = ResolvedMessageContract<T> extends MessageContract<unknown, infer Response> ? Response : unknown;
interface TypedMessage<T extends MessageType = MessageType> {
  type: T;
  payload: MessageRequest<T>;
}
declare function createMessage<T extends MessageType>(type: T, payload: MessageRequest<T>): TypedMessage<T>;
declare function sendMessage<T extends MessageType>(type: T, payload: MessageRequest<T>, options?: unknown): Promise<MessageResponse<T>>;
declare function sendMessageToTab<T extends MessageType>(tabId: number, type: T, payload: MessageRequest<T>, options?: unknown): Promise<MessageResponse<T>>;
//#endregion
export { MessageContract, MessageRequest, MessageResponse, MessageType, TypedMessage, createMessage, sendMessage, sendMessageToTab };
//# sourceMappingURL=index.d.mts.map