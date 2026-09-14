import { z } from 'zod'
import { type LlmClient, LlmError, type LlmMessage, type LlmRequest, type LlmResponse } from './types.ts'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_TIMEOUT_MS = 60_000

export interface OpenRouterOptions {
  apiKey: string
  model: string
  baseUrl?: string
  /** Sent as HTTP-Referer and X-Title, which OpenRouter shows in its dashboard. Optional. */
  appUrl?: string
  appName?: string
  timeoutMs?: number
  /** Injected in tests. */
  fetch?: typeof fetch
}

/** The OpenAI-compatible wire format of OpenRouter's /chat/completions. Only what we read is validated. */
const responseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string().nullish() }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
})

const errorBodySchema = z.object({ error: z.object({ message: z.string().optional() }).optional() })

function toWire(message: LlmMessage) {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      }
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
  }
}

function errorKind(status: number): LlmError['kind'] {
  if (status === 429) return 'rate_limited'
  if (status === 408) return 'timeout'
  return status >= 500 ? 'unavailable' : 'rejected'
}

/** A language model reached through OpenRouter. The API key never leaves the server. */
export function createOpenRouterClient(options: OpenRouterOptions): LlmClient {
  const baseUrl = (options.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    model: options.model,

    async complete(request: LlmRequest): Promise<LlmResponse> {
      const body = {
        model: options.model,
        messages: request.messages.map(toWire),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                type: 'function',
                function: { name: tool.name, description: tool.description, parameters: tool.parameters },
              })),
            }
          : {}),
        ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        // Only route to providers that neither store prompts nor train on them.
        provider: { data_collection: 'deny' },
      }
      const signals = [AbortSignal.timeout(timeoutMs), ...(request.signal ? [request.signal] : [])]

      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
            ...(options.appUrl ? { 'HTTP-Referer': options.appUrl } : {}),
            ...(options.appName ? { 'X-Title': options.appName } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.any(signals),
        })
      } catch (error) {
        const timedOut =
          error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        throw new LlmError(timedOut ? 'timeout' : 'unavailable', 'OpenRouter request failed')
      }

      if (!response.ok) {
        // The provider's message helps operators; it never contains the prompt.
        const parsed = errorBodySchema.safeParse(await response.json().catch(() => null))
        const detail = parsed.success ? parsed.data.error?.message : undefined
        throw new LlmError(
          errorKind(response.status),
          `OpenRouter answered ${response.status}${detail ? `: ${detail}` : ''}`,
          response.status,
        )
      }

      const parsed = responseSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) throw new LlmError('invalid_response', 'OpenRouter answer has an unexpected shape')
      const [choice] = parsed.data.choices
      if (!choice) throw new LlmError('invalid_response', 'OpenRouter answer has no choices')

      return {
        content: choice.message.content ?? '',
        toolCalls: (choice.message.tool_calls ?? []).map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments ?? '{}',
        })),
        finishReason: choice.finish_reason ?? null,
        usage: parsed.data.usage
          ? {
              promptTokens: parsed.data.usage.prompt_tokens,
              completionTokens: parsed.data.usage.completion_tokens,
            }
          : null,
        model: parsed.data.model ?? options.model,
      }
    },
  }
}
