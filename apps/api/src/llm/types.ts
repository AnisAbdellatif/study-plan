/**
 * The provider-neutral interface the chat uses to talk to a language model. Everything above this file (tools,
 * prompts, routes) depends only on these types, so a different provider or a local model needs one new client and
 * no other change.
 */

/** A function the model may call. `parameters` is a JSON Schema object. */
export interface LlmToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LlmToolCall {
  id: string
  name: string
  /** The arguments as the model wrote them: a JSON text that still needs validating. */
  arguments: string
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

export interface LlmRequest {
  messages: LlmMessage[]
  tools?: LlmToolDefinition[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
}

export interface LlmResponse {
  content: string
  toolCalls: LlmToolCall[]
  /** Why the model stopped, as the provider reports it, e.g. "stop", "tool_calls" or "length". */
  finishReason: string | null
  usage: LlmUsage | null
  /** The model that actually answered; providers may route to a fallback. */
  model: string
}

export interface LlmClient {
  /** The configured model id, for the admin dashboard. */
  readonly model: string
  complete(request: LlmRequest): Promise<LlmResponse>
}

/**
 * - `unavailable`: network error or a provider-side failure (5xx); worth retrying later.
 * - `timeout`: no answer in time.
 * - `rate_limited`: the provider throttles this key.
 * - `rejected`: the provider refused the request (invalid key, no credit, invalid input).
 * - `invalid_response`: the answer did not have the expected shape.
 */
export type LlmErrorKind = 'unavailable' | 'timeout' | 'rate_limited' | 'rejected' | 'invalid_response'

export class LlmError extends Error {
  override readonly name = 'LlmError'
  readonly kind: LlmErrorKind
  readonly status: number | undefined

  constructor(kind: LlmErrorKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status
  }
}
