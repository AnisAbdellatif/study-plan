import type { LlmClient, LlmMessage, LlmUsage } from '../llm/types.ts'
import type { ChatProgramme } from './programme.ts'
import { CHAT_TOOLS, executeTool } from './tools.ts'

/** A message of the conversation as the browser keeps it. The server stores no chat history. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatAnswer {
  reply: string
  /** Modules the answer is based on, in the order they were looked up; for links next to the answer. */
  moduleCodes: string[]
  usage: LlmUsage
}

const MAX_TOOL_ROUNDS = 4
const MAX_REFERENCES = 8

const LANGUAGE = { de: 'German', en: 'English' } as const

export function systemPrompt(programme: ChatProgramme, locale: 'de' | 'en'): string {
  const degree = programme.degree === 'bsc' ? 'B.Sc.' : 'M.Sc.'
  return `You are the study assistant of a study planner for students at German universities. You help a student with questions about one degree programme: ${degree} ${programme.programme} at ${programme.university}, examination regulations "${programme.poVersion}".

Rules:
- Answer only from the programme data you get through the tools. Look things up before answering; never invent modules, credits, rules, people or dates.
- Name modules with their name and code, e.g. "Programmieren I (INF-101)".
- If the data does not answer a question, say so and point the student to the official examination regulations, the module handbook, the student advisory service (Studienberatung) or the examination office (Prüfungsamt).
- You do not know the student's grades, results, exam dates or personal plan, and you never ask for them. If asked, explain that this assistant only knows the programme data.
- Your answers are guidance, not binding advice.
- Reply in ${LANGUAGE[locale]} unless the student writes in another language. Be concise. Format with Markdown where it helps: short paragraphs, "- " lists, **bold** for key facts, a small table to compare modules. No images, no HTML, and at most a short "###" heading.`
}

/**
 * Answers the last user message of `history`. The model may call the programme tools a few times; if it keeps
 * calling them, a last request without tools forces an answer.
 */
export async function runChat({
  llm,
  programme,
  history,
  locale,
  signal,
}: {
  llm: LlmClient
  programme: ChatProgramme
  history: readonly ChatTurn[]
  locale: 'de' | 'en'
  signal?: AbortSignal
}): Promise<ChatAnswer> {
  const messages: LlmMessage[] = [{ role: 'system', content: systemPrompt(programme, locale) }, ...history]
  const usage: LlmUsage = { promptTokens: 0, completionTokens: 0, cost: null }
  const references: string[] = []
  const addUsage = (next: LlmUsage | null) => {
    usage.promptTokens += next?.promptTokens ?? 0
    usage.completionTokens += next?.completionTokens ?? 0
    if (next?.cost != null) usage.cost = (usage.cost ?? 0) + next.cost
  }

  let reply: string | null = null
  for (let round = 0; round <= MAX_TOOL_ROUNDS && reply === null; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS
    const response = await llm.complete({
      messages,
      ...(lastRound ? {} : { tools: CHAT_TOOLS }),
      maxTokens: 1200,
      temperature: 0.2,
      signal,
    })
    addUsage(response.usage)
    if (lastRound || response.toolCalls.length === 0) {
      reply = response.content.trim()
      break
    }
    messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls })
    for (const call of response.toolCalls) {
      const output = executeTool(programme, call.name, call.arguments)
      references.push(...output.moduleCodes)
      messages.push({ role: 'tool', toolCallId: call.id, content: output.content })
    }
  }

  const text = reply ?? ''
  // Modules named in the answer count as references too, even when the model only searched.
  const mentioned = programme.modules
    .filter((module) => text.includes(module.code))
    .map((module) => module.code)
  return {
    reply: text,
    moduleCodes: [...new Set([...references, ...mentioned])].slice(0, MAX_REFERENCES),
    usage,
  }
}
