import { describe, expect, it } from 'vitest'
import { de, en, isLang, pickLang, stringsFor } from './strings'

describe('pickLang', () => {
  it('follows the browser when the address says nothing', () => {
    expect(pickLang('', 'de-DE')).toBe('de')
    expect(pickLang('', 'de')).toBe('de')
    expect(pickLang('', 'en-GB')).toBe('en')
  })

  it('sends every other language to English', () => {
    expect(pickLang('', 'fr-FR')).toBe('en')
    expect(pickLang('', '')).toBe('en')
    expect(pickLang('', undefined)).toBe('en')
  })

  it('lets the address win over the browser', () => {
    expect(pickLang('?lang=en', 'de-DE')).toBe('en')
    expect(pickLang('?lang=de', 'en-GB')).toBe('de')
  })

  it('ignores a language it does not have', () => {
    expect(pickLang('?lang=fr', 'de-DE')).toBe('de')
    expect(pickLang('?lang=', 'de-DE')).toBe('de')
  })

  it('finds the parameter among others', () => {
    expect(pickLang('?season=winter&lang=en', 'de-DE')).toBe('en')
  })
})

describe('isLang', () => {
  it('accepts only the two we ship', () => {
    expect(isLang('de')).toBe(true)
    expect(isLang('en')).toBe(true)
    expect(isLang('EN')).toBe(false)
    expect(isLang(null)).toBe(false)
  })
})

describe('stringsFor', () => {
  it('hands out the matching dictionary', () => {
    expect(stringsFor('de')).toBe(de)
    expect(stringsFor('en')).toBe(en)
  })

  /*
   * The two dictionaries must stay in step: a key added to one and forgotten in
   * the other would fall back to undefined and print nothing at all.
   */
  it('keeps both dictionaries complete and in the same shape', () => {
    const shape = (strings: Record<string, unknown>) =>
      Object.entries(strings)
        .map(([key, value]) => `${key}:${typeof value}`)
        .sort()

    expect(shape(en as never)).toEqual(shape(de as never))
  })

  it('leaves nothing in German inside the English dictionary', () => {
    const texts = JSON.stringify(
      Object.entries(en).map(([key, value]) =>
        typeof value === 'function' ? [key, value('X', 'Y', 'Z')] : [key, value],
      ),
    )
    expect(texts).not.toMatch(/[äöüÄÖÜß]/)
    expect(texts).not.toMatch(/\b(und|oder|nicht|Quest annehmen|Seite|Buch)\b/)
  })

  it('formats the same count in both languages', () => {
    expect(de.counter(2, 8)).toBe('Quests: 2/8')
    expect(en.counter(2, 8)).toBe('Quests: 2/8')
  })

  it('leaves the status out of the accept notice when there is none', () => {
    expect(en.taken('PRO-1', 'Julien', null)).toBe('Julien took PRO-1')
    expect(en.taken('PRO-1', 'Julien', 'In Progress')).toBe(
      'Julien took PRO-1, status In Progress',
    )
    expect(de.taken('PRO-1', 'Julien', null)).toBe('PRO-1 übernimmt Julien')
  })
})
