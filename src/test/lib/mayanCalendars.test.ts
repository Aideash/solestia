import { describe, expect, it } from 'vitest'
import {
  civilToMayanDays,
  formatMayanNumeral,
  longCountFromDays,
  mayanCalendarRound,
  mayanCalendarDrivers,
} from '../../lib/mayanCalendars.ts'

/** Noon-ish local civil date, matching other calendar checks. */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 34, 56, 789)
}

describe('civilToMayanDays', () => {
  it('maps 2012-12-21 to 13.0.0.0.0 (GMT)', () => {
    expect(civilToMayanDays({ year: 2012, month: 12, day: 21 })).toBe(1_872_000)
  })

  it('maps the creation epoch to day 0', () => {
    expect(civilToMayanDays({ year: -3113, month: 8, day: 11 })).toBe(0)
  })
})

describe('longCountFromDays', () => {
  it('splits 13.0.0.0.0', () => {
    expect(longCountFromDays(1_872_000)).toEqual({
      baktun: 13,
      katun: 0,
      tun: 0,
      winal: 0,
      kin: 0,
    })
  })

  it('splits a mixed count', () => {
    // 9.12.2.0.16 → (((9*20+12)*20+2)*18+0)*20+16
    const days = (((9 * 20 + 12) * 20 + 2) * 18 + 0) * 20 + 16
    expect(longCountFromDays(days)).toEqual({
      baktun: 9,
      katun: 12,
      tun: 2,
      winal: 0,
      kin: 16,
    })
  })
})

describe('mayanCalendarRound', () => {
  it('gives 4 Ajaw 3 Kʼankʼin on 13.0.0.0.0', () => {
    expect(mayanCalendarRound(1_872_000)).toEqual({
      tzolkinNumber: 4,
      tzolkinName: 'Ajaw',
      haabMonth: 'Kʼankʼin',
      haabMonthIndex: 13,
      haabDay: 3,
    })
  })

  it('gives 4 Ajaw 8 Kumkʼu on day 0', () => {
    expect(mayanCalendarRound(0)).toEqual({
      tzolkinNumber: 4,
      tzolkinName: 'Ajaw',
      haabMonth: 'Kumkʼu',
      haabMonthIndex: 17,
      haabDay: 8,
    })
  })
})

describe('formatMayanNumeral', () => {
  it('formats unicode bar-dot digits', () => {
    expect(formatMayanNumeral(0, 'unicode')).toBe('\u{1D2E0}')
    expect(formatMayanNumeral(4, 'unicode')).toBe('\u{1D2E4}')
    expect(formatMayanNumeral(19, 'unicode')).toBe('\u{1D2F3}')
  })

  it('formats ascii bar-dot digits', () => {
    expect(formatMayanNumeral(0, 'ascii')).toBe('Θ')
    expect(formatMayanNumeral(1, 'ascii')).toBe('·')
    expect(formatMayanNumeral(5, 'ascii')).toBe('|')
    expect(formatMayanNumeral(6, 'ascii')).toBe('·|')
    expect(formatMayanNumeral(19, 'ascii')).toBe('····|||')
  })
})

describe('mayan calendar drivers', () => {
  const round = mayanCalendarDrivers.find((d) => d.id === 'mayan-calendar-round')!
  const longCount = mayanCalendarDrivers.find((d) => d.id === 'mayan-long-count')!

  it('exposes calendar round and long count drivers', () => {
    expect(round.name).toBe('Mayan Calendar Round')
    expect(longCount.name).toBe('Mayan Long Count')
  })

  it('builds a Haab month grid labeled with Tzolkin', () => {
    const at = localDate(2012, 12, 21)
    const grid = round.monthGrid(at)
    expect(grid).not.toBeNull()
    expect(grid!.yearNav).toBe(false)
    expect(grid!.headingPrimary).toBe('Kʼankʼin')
    expect(grid!.headingSecondary).toBeUndefined()
    expect(grid!.columnCount).toBe(5)
    expect(grid!.weekdayLabels).toEqual([])
    expect(grid!.cells).toHaveLength(20)
    const selected = round.dateParts(at)
    const cell = grid!.cells.find((c) => c.key === selected.key)
    expect(cell?.label).toBe('4 Ajaw')
    expect(cell?.title).toBe('4 Ajaw · 3 Kʼankʼin')
  })

  it('no-ops year shifts on the calendar round', () => {
    const at = localDate(2012, 12, 21)
    expect(round.shiftYear(at, 1).getTime()).toBe(at.getTime())
  })

  it('builds a Long Count winal grid with tun heading', () => {
    const at = localDate(2012, 12, 21)
    const grid = longCount.monthGrid(at)
    expect(grid).not.toBeNull()
    expect(grid!.headingPrimary).toBe('Winal 0')
    expect(grid!.headingSecondary).toBe('13.0.0')
    expect(grid!.columnCount).toBe(5)
    expect(grid!.cells).toHaveLength(20)
    expect(longCount.dateParts(at).key).toBe('mayan-lc-13.0.0.0.0')
  })

  it('steps Long Count year by one tun', () => {
    const at = localDate(2012, 12, 21)
    const next = longCount.shiftYear(at, 1)
    expect(longCount.dateParts(next).key).toBe('mayan-lc-13.0.1.0.0')
  })

  it('uses Mayan numerals in native locale', () => {
    const at = localDate(2012, 12, 21)
    const grid = round.monthGrid(at, 'myn')
    const selected = round.dateParts(at)
    const cell = grid!.cells.find((c) => c.key === selected.key)
    expect(cell?.label).toBe(`${formatMayanNumeral(4, 'unicode')} Ajaw`)
    const lc = longCount.monthGrid(at, 'myn')
    expect(lc!.headingSecondary).toBe(
      [
        formatMayanNumeral(13, 'unicode'),
        formatMayanNumeral(0, 'unicode'),
        formatMayanNumeral(0, 'unicode'),
      ].join('.'),
    )
  })
})
