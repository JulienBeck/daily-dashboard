import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api.js'
import { CharacterSheet } from './CharacterSheet.js'

vi.mock('../../api.js')
vi.mock('./scene.js', () => ({ createStage: vi.fn(() => new Promise(() => undefined)) }))

const items = [
  { id: 'wool-hood', equipped: true },
  { id: 'iron-helm', equipped: false },
  { id: 'short-sword', equipped: true },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getEquipment).mockResolvedValue({ body: 'male', items })
})

const sheet = async () => {
  render(<CharacterSheet name="Anna Berg" />)
  await screen.findByRole('button', { name: 'Kopf: Wollkapuze' })
}

describe('CharacterSheet', () => {
  it('shows the figure with every slot around it, filled or empty', async () => {
    await sheet()

    expect(screen.getByRole('img', { name: 'Spielfigur von Anna Berg' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Waffe rechts: Kurzschwert' })).toBeInTheDocument()
    for (const label of ['Schultern', 'Brust', 'Hände', 'Beine', 'Füße', 'Waffe links']) {
      expect(screen.getByRole('button', { name: `${label}: leer` })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Kopf: Wollkapuze' }).querySelector('[data-item="wool-hood"]')).not.toBeNull()
  })

  it('starts with the body the player chose', async () => {
    vi.mocked(api.getEquipment).mockResolvedValue({ body: 'female', items })
    await sheet()

    expect(screen.getByRole('radio', { name: 'Frau' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Mann' })).toHaveAttribute('aria-checked', 'false')
  })

  it('switches the body and keeps the equipment', async () => {
    vi.mocked(api.setBody).mockResolvedValue({ body: 'female', items })
    await sheet()

    fireEvent.click(screen.getByRole('radio', { name: 'Frau' }))

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Frau' })).toHaveAttribute('aria-checked', 'true'))
    expect(api.setBody).toHaveBeenCalledWith('female')
    expect(screen.getByRole('button', { name: 'Kopf: Wollkapuze' })).toBeInTheDocument()
  })

  it('switches back to the male body', async () => {
    vi.mocked(api.getEquipment).mockResolvedValue({ body: 'female', items })
    vi.mocked(api.setBody).mockResolvedValue({ body: 'male', items })
    await sheet()

    fireEvent.click(screen.getByRole('radio', { name: 'Mann' }))

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Mann' })).toHaveAttribute('aria-checked', 'true'))
    expect(api.setBody).toHaveBeenCalledWith('male')
  })

  it('does not ask again for the body already chosen', async () => {
    await sheet()

    fireEvent.click(screen.getByRole('radio', { name: 'Mann' }))

    expect(api.setBody).not.toHaveBeenCalled()
  })

  it('shows why the body could not be changed', async () => {
    vi.mocked(api.setBody).mockRejectedValue(new Error('Körperbau: Mann oder Frau?'))
    await sheet()

    fireEvent.click(screen.getByRole('radio', { name: 'Frau' }))

    expect(await screen.findByText('Ausrüstung: Körperbau: Mann oder Frau?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Mann' })).toHaveAttribute('aria-checked', 'true')
  })

  it('opens the choice for a slot and closes it on a second click', async () => {
    await sheet()
    const head = screen.getByRole('button', { name: 'Kopf: Wollkapuze' })

    fireEvent.click(head)
    const choice = screen.getByRole('region', { name: 'Kopf' })
    expect(head).toHaveAttribute('aria-pressed', 'true')
    expect(within(choice).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'WollkapuzeGewöhnlich · angelegtAblegen',
      'EisenhelmUngewöhnlichAnlegen',
    ])

    fireEvent.click(head)
    expect(screen.queryByRole('region', { name: 'Kopf' })).not.toBeInTheDocument()
  })

  it('swaps the item and redraws the figure', async () => {
    vi.mocked(api.setEquipped).mockResolvedValue({
      body: 'male',
      items: [
        { id: 'wool-hood', equipped: false },
        { id: 'iron-helm', equipped: true },
        { id: 'short-sword', equipped: true },
      ],
    })
    await sheet()
    fireEvent.click(screen.getByRole('button', { name: 'Kopf: Wollkapuze' }))

    fireEvent.click(within(screen.getByRole('region', { name: 'Kopf' })).getByRole('button', { name: 'Anlegen' }))

    expect(await screen.findByRole('button', { name: 'Kopf: Eisenhelm' })).toBeInTheDocument()
    expect(api.setEquipped).toHaveBeenCalledWith('iron-helm', true)
  })

  it('takes an item off', async () => {
    vi.mocked(api.setEquipped).mockResolvedValue({ body: 'male', items: items.map((item) => ({ ...item, equipped: false })) })
    await sheet()
    fireEvent.click(screen.getByRole('button', { name: 'Waffe rechts: Kurzschwert' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ablegen' }))

    expect(await screen.findByRole('button', { name: 'Waffe rechts: leer' })).toBeInTheDocument()
    expect(api.setEquipped).toHaveBeenCalledWith('short-sword', false)
  })

  it('says when there is nothing for a slot', async () => {
    await sheet()

    fireEvent.click(screen.getByRole('button', { name: 'Füße: leer' }))

    expect(screen.getByText('Nichts für diesen Platz im Gepäck.')).toBeInTheDocument()
  })

  it('shows why a swap failed', async () => {
    vi.mocked(api.setEquipped).mockRejectedValue(new Error('iron-helm gehört nicht zur Ausrüstung'))
    await sheet()
    fireEvent.click(screen.getByRole('button', { name: 'Kopf: Wollkapuze' }))

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))

    expect(await screen.findByText('Ausrüstung: iron-helm gehört nicht zur Ausrüstung')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kopf: Wollkapuze' })).toBeInTheDocument()
  })

  it('says it is loading and why the equipment is missing', async () => {
    vi.mocked(api.getEquipment).mockRejectedValue(new Error('DATABASE_URL ist nicht gesetzt'))
    render(<CharacterSheet name="Anna Berg" />)

    expect(screen.getByText('Ausrüstung wird geladen …')).toBeInTheDocument()
    expect(await screen.findByText('Ausrüstung: DATABASE_URL ist nicht gesetzt')).toBeInTheDocument()
  })
})
