import { describe, expect, it } from 'vitest'
import { createOpenRouterClient } from './openrouter.ts'
import { LlmError } from './types.ts'

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as typeof fetch
  return { impl, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('OpenRouter client', () => {
  it('sends the model, messages, tools and privacy routing, and reads tool calls and usage', async () => {
    const fetch = fakeFetch(() =>
      json({
        model: 'anthropic/claude-haiku-4.5',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'get_module', arguments: '{"code":"INF-101"}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132, cost: 0.00042 },
      }),
    )
    const client = createOpenRouterClient({
      apiKey: 'sk-test',
      model: 'anthropic/claude-haiku-4.5',
      baseUrl: 'https://openrouter.test/api/v1/',
      appUrl: 'https://plan.example.org',
      appName: 'Study Plan',
      fetch: fetch.impl,
    })

    const response = await client.complete({
      messages: [
        { role: 'system', content: 'Rules' },
        { role: 'user', content: 'Frage' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'old', name: 'search_modules', arguments: '{}' }],
        },
        { role: 'tool', toolCallId: 'old', content: '{"total":0}' },
      ],
      tools: [{ name: 'get_module', description: 'One module', parameters: { type: 'object' } }],
      maxTokens: 500,
      temperature: 0.2,
    })

    expect(response).toEqual({
      content: '',
      toolCalls: [{ id: 'call-1', name: 'get_module', arguments: '{"code":"INF-101"}' }],
      finishReason: 'tool_calls',
      usage: { promptTokens: 120, completionTokens: 12, cost: 0.00042 },
      model: 'anthropic/claude-haiku-4.5',
    })
    const [call] = fetch.calls
    expect(call?.url).toBe('https://openrouter.test/api/v1/chat/completions')
    const headers = new Headers(call?.init.headers)
    expect(headers.get('authorization')).toBe('Bearer sk-test')
    expect(headers.get('HTTP-Referer')).toBe('https://plan.example.org')
    const body = JSON.parse(String(call?.init.body))
    expect(body).toMatchObject({
      model: 'anthropic/claude-haiku-4.5',
      max_tokens: 500,
      temperature: 0.2,
      provider: { data_collection: 'deny' },
      tools: [{ type: 'function', function: { name: 'get_module', description: 'One module' } }],
    })
    expect(body.messages[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'old', type: 'function', function: { name: 'search_modules', arguments: '{}' } }],
    })
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'old', content: '{"total":0}' })
  })

  it.each([
    [429, 'rate_limited'],
    [401, 'rejected'],
    [402, 'rejected'],
    [503, 'unavailable'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    const fetch = fakeFetch(() => json({ error: { message: 'nope' } }, status))
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: fetch.impl })
    const error = await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((caught) => caught)
    expect(error).toBeInstanceOf(LlmError)
    expect(error).toMatchObject({ kind, status })
  })

  it('reports unexpected answers and network failures', async () => {
    const odd = createOpenRouterClient({
      apiKey: 'k',
      model: 'm',
      fetch: fakeFetch(() => json({ choices: [] })).impl,
    })
    await expect(odd.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({
      kind: 'invalid_response',
    })

    const offline = createOpenRouterClient({
      apiKey: 'k',
      model: 'm',
      fetch: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    })
    await expect(offline.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })

  it('uses a model chosen per request', async () => {
    const fetch = fakeFetch(() =>
      json({ model: 'openai/gpt-5-mini', choices: [{ message: { content: 'Hi' } }] }),
    )
    const client = createOpenRouterClient({ apiKey: 'k', model: 'default/model', fetch: fetch.impl })
    const response = await client.complete({
      model: 'openai/gpt-5-mini',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(JSON.parse(String(fetch.calls[0]?.init.body)).model).toBe('openai/gpt-5-mini')
    expect(response.model).toBe('openai/gpt-5-mini')
  })

  it('describes a model: providers, tool support, price per million tokens, and unknown ids as null', async () => {
    const endpoints = (prices: [string, string][]) =>
      json({
        data: {
          id: 'google/gemma-4-31b-it',
          name: 'Google: Gemma 4 31B',
          endpoints: prices.map(([prompt, completion], index) => ({
            provider_name: `Provider ${index}`,
            context_length: 131072 * (index + 1),
            pricing: { prompt, completion, input_cache_read: '0' },
            // Only the first provider supports tools, although the second one is cheaper.
            supported_parameters: index === 0 ? ['tools', 'tool_choice', 'max_tokens'] : ['max_tokens'],
          })),
        },
      })

    const paidFetch = fakeFetch(() =>
      endpoints([
        ['0.00000009', '0.00000034'],
        ['0.00000002', '0.00000005'],
      ]),
    )
    const paid = createOpenRouterClient({
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://openrouter.test/api/v1',
      fetch: paidFetch.impl,
    })
    const info = await paid.describeModel?.('google/gemma-4-31b-it')
    expect(info).toMatchObject({
      id: 'google/gemma-4-31b-it',
      name: 'Google: Gemma 4 31B',
      providers: 2,
      supportsTools: true,
      free: false,
      contextLength: 262144,
    })
    expect(info?.pricing?.prompt).toBeCloseTo(0.09)
    expect(info?.pricing?.completion).toBeCloseTo(0.34)
    expect(paidFetch.calls[0]?.url).toBe(
      'https://openrouter.test/api/v1/models/google/gemma-4-31b-it/endpoints',
    )

    const free = createOpenRouterClient({
      apiKey: 'k',
      model: 'm',
      fetch: fakeFetch(() => endpoints([['0', '0']])).impl,
    })
    expect(await free.describeModel?.('google/gemma-4-31b-it:free')).toMatchObject({
      free: true,
      pricing: { prompt: 0, completion: 0 },
    })

    const missing = createOpenRouterClient({
      apiKey: 'k',
      model: 'm',
      fetch: fakeFetch(() => json({ error: { message: 'Model not found' } }, 404)).impl,
    })
    expect(await missing.describeModel?.('nobody/nothing')).toBeNull()
  })

  it('reads the key’s spending', async () => {
    const fetch = fakeFetch(() =>
      json({
        data: {
          label: 'sk-or-v1-abc...xyz',
          usage: 1.25,
          usage_daily: 0.05,
          usage_weekly: 0.4,
          usage_monthly: 1.1,
          limit: 10,
          limit_remaining: 8.75,
          is_free_tier: false,
        },
      }),
    )
    const client = createOpenRouterClient({
      apiKey: 'sk-test',
      model: 'm',
      baseUrl: 'https://openrouter.test/api/v1',
      fetch: fetch.impl,
    })

    expect(await client.credits?.()).toEqual({
      used: 1.25,
      usedToday: 0.05,
      usedThisWeek: 0.4,
      usedThisMonth: 1.1,
      limit: 10,
      remaining: 8.75,
    })
    const [call] = fetch.calls
    expect(call?.url).toBe('https://openrouter.test/api/v1/key')
    expect(call?.init.method).toBe('GET')
    expect(call?.init.body).toBeUndefined()
    expect(new Headers(call?.init.headers).get('authorization')).toBe('Bearer sk-test')

    const broken = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: fakeFetch(() => json({})).impl })
    await expect(broken.credits?.()).rejects.toMatchObject({ kind: 'invalid_response' })
  })
})
