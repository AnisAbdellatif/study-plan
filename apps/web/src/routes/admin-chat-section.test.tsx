import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import type { AdminChatSettings, ChatModelInfo } from '../lib/api.ts'
import { ChatSettingsSection } from './admin-chat-section.tsx'

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const settings: AdminChatSettings = {
  enabled: true,
  dailyLimit: 20,
  configured: true,
  model: 'anthropic/claude-haiku-4.5',
  customModel: null,
  defaultModel: 'anthropic/claude-haiku-4.5',
}

const model = (id: string, overrides: Partial<ChatModelInfo> = {}): ChatModelInfo => ({
  id,
  name: id,
  providers: 3,
  supportsTools: true,
  free: false,
  pricing: { prompt: 1.25, completion: 10 },
  contextLength: 400000,
  ...overrides,
})

function mockApi() {
  const saved: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (url === '/api/admin/chat' && init?.method === 'PUT') {
      saved.push(body)
      return respond({ ...settings, model: body.model ?? settings.defaultModel, customModel: body.model })
    }
    if (url === '/api/admin/chat') return respond(settings)
    if (url === '/api/admin/chat/model-check') {
      if (body.model === 'openai/gpt-5')
        return respond({ model: model('openai/gpt-5', { name: 'OpenAI: GPT-5' }) })
      if (body.model === 'google/gemma-4-31b-it:free')
        return respond({ model: model(body.model, { free: true, pricing: { prompt: 0, completion: 0 } }) })
      return respond({ error: 'unknown_model' }, 400)
    }
    return respond({ error: 'not_found' }, 404)
  })
  return saved
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('study assistant settings', () => {
  it('warns about a paid model with its price and only saves it once confirmed', async () => {
    const saved = mockApi()
    const user = userEvent.setup()
    render(<ChatSettingsSection onChanged={vi.fn()} />)

    await user.type(await screen.findByLabelText('Modell (OpenRouter-ID)'), 'openai/gpt-5')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent('„OpenAI: GPT-5“ ist nicht kostenlos')
    expect(warning).toHaveTextContent(/1,25\s\$ pro Million Eingabe-Tokens/)
    expect(saved).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Trotzdem verwenden' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Gespeichert.')
    expect(saved).toEqual([{ enabled: true, dailyLimit: 20, model: 'openai/gpt-5', acceptPaid: true }])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('saves a free model right away with a note, and explains an unknown one', async () => {
    const saved = mockApi()
    const user = userEvent.setup()
    render(<ChatSettingsSection onChanged={vi.fn()} />)
    const input = await screen.findByLabelText('Modell (OpenRouter-ID)')

    await user.type(input, 'nobody/model')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Bei OpenRouter gibt es kein Modell „nobody/model“.',
    )
    expect(saved).toEqual([])

    await user.clear(input)
    await user.type(input, 'google/gemma-4-31b-it:free')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(
      await screen.findByText(/Kostenlose Modelle haben bei OpenRouter enge Tageslimits/),
    ).toBeInTheDocument()
    expect(saved).toEqual([
      { enabled: true, dailyLimit: 20, model: 'google/gemma-4-31b-it:free', acceptPaid: false },
    ])
  })
})
