import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoinRow, QuestMarker } from './icons'

describe('QuestMarker', () => {
  // Two things carry the meaning: which glyph is drawn and whether it is gold.
  const glyph = (container: HTMLElement) => {
    const filled = [...container.querySelectorAll('path')].filter(
      (path) => path.getAttribute('stroke') === 'none',
    )
    return {
      shape: filled[0]?.getAttribute('d')?.slice(0, 6),
      fills: [...new Set(filled.map((path) => path.getAttribute('fill')))],
    }
  }

  it('offers a quest to take with a gold exclamation mark', () => {
    const { container } = render(<QuestMarker state="available" status="Open" />)
    expect(screen.getByRole('img', { name: 'Anzunehmen (Open)' })).toBeInTheDocument()
    expect(glyph(container).shape).toBe('M10 3.')
    expect(glyph(container).fills).toEqual(['#ffd100'])
  })

  it('greys the question mark while the quest is being worked on', () => {
    const { container } = render(<QuestMarker state="active" status="In Progress" />)
    expect(screen.getByRole('img', { name: 'Angenommen (In Progress)' })).toBeInTheDocument()
    expect(glyph(container).shape).toBe('M7.2 7')
    expect(glyph(container).fills).toEqual(['#b4b0a8'])
  })

  it('turns the question mark gold once the quest can be handed in', () => {
    const { container } = render(<QuestMarker state="complete" status="Done" />)
    expect(screen.getByRole('img', { name: 'Abzugeben (Done)' })).toBeInTheDocument()
    expect(glyph(container).shape).toBe('M7.2 7')
    expect(glyph(container).fills).toEqual(['#ffd100'])
  })

  it('leaves the brackets off when Jira names no status', () => {
    render(<QuestMarker state="available" status="" />)
    expect(screen.getByRole('img', { name: 'Anzunehmen' })).toBeInTheDocument()
  })

  it('strokes the glyph in dark only — a bright rim turns it into a blob', () => {
    const { container } = render(<QuestMarker state="available" status="" />)
    const strokes = new Set(
      [...container.querySelectorAll('path')].map((path) => path.getAttribute('stroke')),
    )
    // Exactly two kinds: the dark contour, and no stroke at all on the fill.
    expect([...strokes].sort()).toEqual(['#140d02', 'none'])
  })
})

describe('CoinRow', () => {
  it('leaves out a coin nobody gets', () => {
    render(<CoinRow gold={0} silver={50} copper={3} />)
    expect(screen.queryByTitle(/Gold/)).not.toBeInTheDocument()
    expect(screen.getByTitle('50 Silber')).toBeInTheDocument()
    expect(screen.getByTitle('3 Kupfer')).toBeInTheDocument()
  })

  it('shows an empty purse as zero copper', () => {
    render(<CoinRow gold={0} silver={0} copper={0} />)
    expect(screen.getByTitle('0 Kupfer')).toBeInTheDocument()
  })
})
