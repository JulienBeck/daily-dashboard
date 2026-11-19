import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api.js'
import { CharacterSheet } from './CharacterSheet.js'

vi.mock('../../api.js')

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
    expect(screen.getByRole('img', { name: 'Spielfigur von Anna Berg' }).querySelector('[data-part="head"]')).not.toBeNull()
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
