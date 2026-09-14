import { z } from 'zod'
import {
  type LlmClient,
  type LlmCredits,
  LlmError,
  type LlmMessage,
  type LlmModelInfo,
  type LlmRequest,
  type LlmResponse,
} from './types.ts'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_TIMEOUT_MS = 60_000
const CREDITS_TIMEOUT_MS = 10_000

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
  usage: z
    .object({ prompt_tokens: z.number(), completion_tokens: z.number(), cost: z.number().nullish() })
    .nullish(),
})

/** GET /key: the spending of the key the request is made with. */
const keySchema = z.object({
  data: z.object({
    usage: z.number(),
    usage_daily: z.number().nullish(),
    usage_weekly: z.number().nullish(),
    usage_monthly: z.number().nullish(),
    limit: z.number().nullish(),
    limit_remaining: z.number().nullish(),
  }),
})

/** GET /models/{id}/endpoints: the providers serving a model. Prices are USD per token, sent as strings. */
const modelEndpointsSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    endpoints: z.array(
      z.object({
        context_length: z.number().nullish(),
        pricing: z.object({ prompt: z.coerce.number(), completion: z.coerce.number() }),
        supported_parameters: z.array(z.string()).nullish(),
      }),
    ),
  }),
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

  /** Sends one request and returns the parsed JSON of a successful answer; every failure becomes an LlmError. */
  async function send(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
    timeout: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const signals = [AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(options.appUrl ? { 'HTTP-Referer': options.appUrl } : {}),
          ...(options.appName ? { 'X-Title': options.appName } : {}),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
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
    return response.json().catch(() => null)
  }

  return {
    model: options.model,

    async complete(request: LlmRequest): Promise<LlmResponse> {
      const body = {
        model: request.model ?? options.model,
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

      const parsed = responseSchema.safeParse(
        await send('/chat/completions', { method: 'POST', body }, timeoutMs, request.signal),
      )
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
              cost: parsed.data.usage.cost ?? null,
            }
          : null,
        model: parsed.data.model ?? options.model,
      }
    },

    async credits(signal?: AbortSignal): Promise<LlmCredits> {
      const parsed = keySchema.safeParse(await send('/key', { method: 'GET' }, CREDITS_TIMEOUT_MS, signal))
      if (!parsed.success)
        throw new LlmError('invalid_response', 'OpenRouter key info has an unexpected shape')
      const key = parsed.data.data
      return {
        used: key.usage,
        usedToday: key.usage_daily ?? null,
        usedThisWeek: key.usage_weekly ?? null,
        usedThisMonth: key.usage_monthly ?? null,
        limit: key.limit ?? null,
        remaining: key.limit_remaining ?? null,
      }
    },

    async describeModel(id: string, signal?: AbortSignal): Promise<LlmModelInfo | null> {
      let raw: unknown
      try {
        // Ids are checked against a strict pattern before they get here (author/slug with an optional :variant).
        raw = await send(`/models/${id}/endpoints`, { method: 'GET' }, CREDITS_TIMEOUT_MS, signal)
      } catch (error) {
        if (error instanceof LlmError && error.status === 404) return null
        throw error
      }
      const parsed = modelEndpointsSchema.safeParse(raw)
      if (!parsed.success)
        throw new LlmError('invalid_response', 'OpenRouter model info has an unexpected shape')

      const { endpoints } = parsed.data.data
      const withTools = endpoints.filter((endpoint) => endpoint.supported_parameters?.includes('tools'))
      const [cheapest] = [...withTools].sort(
        (a, b) => a.pricing.prompt + a.pricing.completion - (b.pricing.prompt + b.pricing.completion),
      )
      const contextLengths = endpoints.flatMap((endpoint) => endpoint.context_length ?? [])
      return {
        id: parsed.data.data.id,
        name: parsed.data.data.name,
        providers: endpoints.length,
        supportsTools: withTools.length > 0,
        free:
          endpoints.length > 0 &&
          endpoints.every((endpoint) => endpoint.pricing.prompt === 0 && endpoint.pricing.completion === 0),
        pricing: cheapest
          ? {
              prompt: cheapest.pricing.prompt * 1_000_000,
              completion: cheapest.pricing.completion * 1_000_000,
            }
          : null,
        contextLength: contextLengths.length > 0 ? Math.max(...contextLengths) : null,
      }
    },
  }
}
