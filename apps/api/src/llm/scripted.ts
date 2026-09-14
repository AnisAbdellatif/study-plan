import type { LlmClient, LlmRequest, LlmResponse } from './types.ts'

type Step =
  | Partial<LlmResponse>
  | ((request: LlmRequest) => Partial<LlmResponse> | Promise<Partial<LlmResponse>>)

/**
 * A language model for tests: answers with the given steps in order and records every request, so tests can check
 * exactly what would have been sent to a provider.
 */
export function createScriptedLlm(steps: Step[], model = 'test/scripted') {
  const requests: LlmRequest[] = []
  let index = 0
  const client: LlmClient & { requests: LlmRequest[] } = {
    model,
    requests,
    async complete(request) {
      requests.push(structuredClone({ ...request, signal: undefined }))
      const step = steps[Math.min(index, steps.length - 1)]
      index += 1
      const partial = typeof step === 'function' ? await step(request) : (step ?? {})
      return { content: '', toolCalls: [], finishReason: 'stop', usage: null, model, ...partial }
    },
  }
  return client
}
