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
        usage: { prompt_tokens: 120, completion_tokens: 12 },
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
      usage: { promptTokens: 120, completionTokens: 12 },
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
})
