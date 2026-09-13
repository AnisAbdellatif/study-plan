import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button.tsx'

describe('Button loading state', () => {
  it('keeps its label, disables itself and is marked busy while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Registrieren
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Registrieren' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('svg')).not.toBeNull()
    await userEvent.setup().click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('behaves normally when not loading', () => {
    render(<Button>Speichern</Button>)
    const button = screen.getByRole('button', { name: 'Speichern' })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button.querySelector('svg')).toBeNull()
  })

  it('replaces an icon button content with the spinner so its size stays', () => {
    render(
      <Button size="icon" loading aria-label="Aktionen">
        <span data-testid="icon" />
      </Button>,
    )
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aktionen' }).querySelector('svg')).not.toBeNull()
  })
})
