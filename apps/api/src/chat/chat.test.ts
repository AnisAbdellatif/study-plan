import { readFileSync } from 'node:fs'
import {
  addCustomModule,
  createPlanFromPreset,
  presetSchema,
  setExamDate,
  setModuleResult,
  setTargetGrade,
} from '@study-plan/shared'
import { describe, expect, it } from 'vitest'
import { createScriptedLlm } from '../llm/scripted.ts'
import { programmeForChat } from './programme.ts'
import { runChat } from './run-chat.ts'
import { CHAT_TOOLS, executeTool } from './tools.ts'

const preset = presetSchema.parse(
  JSON.parse(
    readFileSync(
      new URL('../../../../packages/shared/examples/informatik-bsc-example.json', import.meta.url),
      'utf8',
    ),
  ),
)

function privatePlan() {
  let plan = createPlanFromPreset(preset, {
    id: 'mine',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  const [first, second] = plan.modules
  if (!first || !second) throw new Error('example needs two modules')
  plan = setModuleResult(plan, first.code, { kind: 'graded', grade: 2.3 })
  plan = setExamDate(plan, second.code, '2027-02-15')
  plan = setTargetGrade(plan, 1.7)
  plan = addCustomModule(plan, {
    name: 'Mein geheimer Sprachkurs',
    credits: 5,
    grading: 'graded',
    countsTowardAverage: false,
    offering: 'both',
    areaId: null,
  }).plan
  return { plan, first: first.code }
}

describe('programmeForChat', () => {
  it('carries programme facts and none of the student’s data', () => {
    const { plan } = privatePlan()
    const programme = programmeForChat(plan)
    const text = JSON.stringify(programme)

    expect(programme.programme).toBe(plan.preset.programmeName)
    expect(programme.modules.length).toBe(plan.modules.length - 1)
    for (const secret of [
      'attempts',
      'examDate',
      '2027-02-15',
      'targetGrade',
      'Mein geheimer Sprachkurs',
      'backlog',
      'semesters',
    ]) {
      expect(text, secret).not.toContain(secret)
    }
  })
})

describe('chat tools', () => {
  const { plan, first } = privatePlan()
  const programme = programmeForChat(plan)
  const call = (name: string, args: unknown) =>
    JSON.parse(executeTool(programme, name, JSON.stringify(args)).content)

  it('searches with filters and returns one module in full', () => {
    const all = call('search_modules', {})
    expect(all.total).toBe(programme.modules.length)
    const summer = call('search_modules', { offeredIn: 'summer' })
    expect(
      summer.modules.every((module: { offering: string }) => ['summer', 'both'].includes(module.offering)),
    ).toBe(true)
    expect(call('search_modules', { query: programme.modules[0]?.name.slice(0, 6) }).total).toBeGreaterThan(0)

    const result = executeTool(programme, 'get_module', JSON.stringify({ code: first }))
    expect(result.moduleCodes).toEqual([first])
    expect(JSON.parse(result.content)).toMatchObject({ code: first })
    expect(result.content).not.toContain('attempts')
  })

  it('answers mistakes with errors the model can correct', () => {
    expect(call('get_module', { code: 'NOPE' }).error).toContain('Unknown module')
    expect(call('search_modules', { areaId: 'nope' }).error).toContain('Unknown area')
    expect(call('search_modules', { limit: 1000 }).error).toBe('Invalid arguments.')
    expect(JSON.parse(executeTool(programme, 'get_module', '{not json').content).error).toContain('JSON')
    expect(call('drop_tables', {}).error).toContain('Unknown tool')
    expect(call('get_programme_overview', {})).toMatchObject({ moduleCount: programme.modules.length })
  })
})

describe('runChat', () => {
  const { plan, first } = privatePlan()
  const programme = programmeForChat(plan)

  it('lets the model look modules up, then returns its answer with references', async () => {
    const llm = createScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'get_module', arguments: JSON.stringify({ code: first }) }],
        usage: { promptTokens: 100, completionTokens: 10, cost: 0.001 },
      },
      {
        content: `Das Modul ${first} hat 8 LP.`,
        usage: { promptTokens: 150, completionTokens: 20, cost: null },
      },
    ])
    const answer = await runChat({
      llm,
      programme,
      history: [{ role: 'user', content: 'Wie viele LP?' }],
      locale: 'de',
    })

    expect(answer).toEqual({
      reply: `Das Modul ${first} hat 8 LP.`,
      moduleCodes: [first],
      usage: { promptTokens: 250, completionTokens: 30, cost: 0.001 },
    })
    expect(llm.requests[0]?.tools).toEqual(CHAT_TOOLS)
    expect(llm.requests[0]?.messages[0]).toMatchObject({ role: 'system' })
    expect(llm.requests[1]?.messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'c1' })
  })

  it('forces an answer without tools when the model keeps calling them', async () => {
    const llm = createScriptedLlm([
      (request) =>
        request.tools
          ? { toolCalls: [{ id: 'again', name: 'search_modules', arguments: '{}' }] }
          : { content: 'Hier ist meine Antwort.' },
    ])
    const answer = await runChat({
      llm,
      programme,
      history: [{ role: 'user', content: 'Hilfe' }],
      locale: 'de',
    })
    expect(answer.reply).toBe('Hier ist meine Antwort.')
    expect(llm.requests.at(-1)?.tools).toBeUndefined()
    expect(llm.requests.length).toBe(5)
  })

  it('asks once more after an empty answer and fails instead of returning a blank reply', async () => {
    const recovering = createScriptedLlm([
      { content: '  ', finishReason: 'length' },
      { content: 'Jetzt aber.' },
    ])
    const answer = await runChat({
      llm: recovering,
      programme,
      history: [{ role: 'user', content: 'Hilfe' }],
      locale: 'de',
    })
    expect(answer.reply).toBe('Jetzt aber.')
    expect(recovering.requests.at(-1)?.tools).toBeUndefined()
    expect(recovering.requests.at(-1)?.messages.at(-1)).toMatchObject({ role: 'user' })

    const silent = createScriptedLlm([{ content: '', finishReason: 'length' }])
    await expect(
      runChat({ llm: silent, programme, history: [{ role: 'user', content: 'Hilfe' }], locale: 'de' }),
    ).rejects.toMatchObject({ kind: 'invalid_response', message: expect.stringContaining('length') })
  })
})
