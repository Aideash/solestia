import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from '../data/planets.ts'
import type { CalendarCell, CalendarDriver, CalendarDateParts } from './calendars.ts'
import {
  clancyMarsYear,
  DARIAN_MSD_EPOCH,
  dateAtLs,
  dateFromLocalMsd,
  localMsd,
  marsSolDate,
  solarLongitude,
  wrapUnit,
} from './marsTime.ts'

const DARIAN_MONTHS = [
  'Sagittarius',
  'Dhanus',
  'Capricornus',
  'Makara',
  'Aquarius',
  'Kumbha',
  'Pisces',
  'Mina',
  'Aries',
  'Mesha',
  'Taurus',
  'Rishabha',
  'Gemini',
  'Mithuna',
  'Cancer',
  'Karka',
  'Leo',
  'Simha',
  'Virgo',
  'Kanya',
  'Libra',
  'Tula',
  'Scorpius',
  'Vrishika',
] as const

const DARIAN_WEEKDAYS = [
  { short: 'Sol', long: 'Sol Solis' },
  { short: 'Lun', long: 'Sol Lunae' },
  { short: 'Mar', long: 'Sol Martis' },
  { short: 'Mer', long: 'Sol Mercurii' },
  { short: 'Jov', long: 'Sol Jovis' },
  { short: 'Ven', long: 'Sol Veneris' },
  { short: 'Sat', long: 'Sol Saturni' },
] as const

const LS_MONTH_SEASONS = [
  'Northern spring',
  'Northern spring',
  'Northern spring',
  'Northern summer',
  'Northern summer',
  'Northern summer',
  'Northern autumn',
  'Northern autumn',
  'Northern autumn',
  'Northern winter',
  'Northern winter',
  'Northern winter',
] as const

type DarianDate = CalendarDateParts & {
  solOfYear: number
  leap: boolean
}

/**
 * Leap sols in years 1..year inclusive. Years 0–2000 use Gangale 2006:
 * (Y−1)/2 + Y/10 − Y/100 + Y/1000 as a cumulative count through year Y
 * when rewritten for 1-based inclusive years.
 */
function cumulativeLeapsThrough(year: number): number {
  if (year < 1) return 0
  return (
    Math.floor((year + 1) / 2) +
    Math.floor(year / 10) -
    Math.floor(year / 100) +
    Math.floor(year / 1000)
  )
}

export function isDarianLeap(year: number): boolean {
  if (year <= 0) return false
  return cumulativeLeapsThrough(year) - cumulativeLeapsThrough(year - 1) === 1
}

export function darianYearLength(year: number): number {
  return isDarianLeap(year) ? 669 : 668
}

export function darianMonthLength(year: number, month: number): number {
  if (month % 6 !== 0) return 28
  if (month === 24 && isDarianLeap(year)) return 28
  return 27
}

function solsBeforeYear(year: number): number {
  if (year <= 0) return 0
  return 668 * year + cumulativeLeapsThrough(year - 1)
}

function solsBeforeMonth(year: number, month: number): number {
  let sols = 0
  for (let m = 1; m < month; m++) sols += darianMonthLength(year, m)
  return sols
}

function darianFromSolIndex(solIndex: number): {
  year: number
  month: number
  day: number
  solOfYear: number
} {
  let year = Math.floor(solIndex / 668.6)
  while (solsBeforeYear(year + 1) <= solIndex) year += 1
  while (solsBeforeYear(year) > solIndex) year -= 1
  const solOfYear = solIndex - solsBeforeYear(year)
  let month = 1
  let remaining = solOfYear
  while (month < 24 && remaining >= darianMonthLength(year, month)) {
    remaining -= darianMonthLength(year, month)
    month += 1
  }
  return { year, month, day: remaining + 1, solOfYear }
}

function darianSolIndex(year: number, month: number, day: number): number {
  return solsBeforeYear(year) + solsBeforeMonth(year, month) + day - 1
}

function darianDateParts(instant: Date, siteId?: string): DarianDate {
  const local = localMsd(instant, siteId)
  const solIndex = Math.floor(local - DARIAN_MSD_EPOCH)
  const parts = darianFromSolIndex(solIndex)
  const monthCode = `M${String(parts.month).padStart(2, '0')}`
  return {
    year: parts.year,
    month: parts.month,
    monthCode,
    day: parts.day,
    solOfYear: parts.solOfYear,
    leap: isDarianLeap(parts.year),
    key: `darian-${parts.year}-${monthCode}-${parts.day}`,
  }
}

function timeOfSol(instant: Date, siteId?: string): number {
  return wrapUnit(localMsd(instant, siteId))
}

function instantOnSol(solIndex: number, time: number, siteId?: string): Date {
  return dateFromLocalMsd(DARIAN_MSD_EPOCH + solIndex + time, siteId)
}

function solInWindow(solIndex: number, siteId?: string): boolean {
  const start = instantOnSol(solIndex, 0, siteId).getTime()
  const end = instantOnSol(solIndex, 1, siteId).getTime() - 1
  return end >= ELEMENTS_VALID_FROM_MS && start <= ELEMENTS_VALID_TO_MS
}

function makeDarianDriver(): CalendarDriver {
  return {
    id: 'darian',
    name: 'Darian',
    dateParts(instant, siteId) {
      return darianDateParts(instant, siteId)
    },
    monthGrid(instant, _locale, siteId) {
      const selected = darianDateParts(instant, siteId)
      const time = timeOfSol(instant, siteId)
      const length = darianMonthLength(selected.year, selected.month)
      const startIndex = darianSolIndex(selected.year, selected.month, 1)
      const cells: CalendarCell[] = Array.from({ length }, (_, offset) => {
        const day = offset + 1
        const solIndex = startIndex + offset
        const weekday = DARIAN_WEEKDAYS[offset % 7]
        return {
          day,
          key: `darian-${selected.year}-${selected.monthCode}-${day}`,
          instant: instantOnSol(solIndex, time, siteId),
          inMonth: true,
          inWindow: solInWindow(solIndex, siteId),
          title: weekday
            ? `${weekday.long}, ${day} ${DARIAN_MONTHS[selected.month - 1]} ${selected.year}`
            : undefined,
        }
      })
      const msd = marsSolDate(instant)
      return {
        headingPrimary: `${DARIAN_MONTHS[selected.month - 1]} · ${selected.year}`,
        headingSecondary: `MSD ${msd.toFixed(2)}`,
        headingTitle: selected.leap ? 'Leap year (669 sols)' : 'Common year (668 sols)',
        columnCount: 7,
        weekdayLabels: DARIAN_WEEKDAYS,
        cells,
      }
    },
    label(instant, _locale, siteId) {
      const parts = darianDateParts(instant, siteId)
      const weekday = DARIAN_WEEKDAYS[(parts.day - 1) % 7]
      const month = DARIAN_MONTHS[parts.month - 1]
      return `${weekday?.long}, ${parts.day} ${month} ${parts.year}`
    },
    shiftMonth(instant, delta, siteId) {
      const parts = darianDateParts(instant, siteId)
      const time = timeOfSol(instant, siteId)
      let year = parts.year
      let month = parts.month + delta
      while (month < 1) {
        year -= 1
        month += 24
      }
      while (month > 24) {
        year += 1
        month -= 24
      }
      const day = Math.min(parts.day, darianMonthLength(year, month))
      return instantOnSol(darianSolIndex(year, month, day), time, siteId)
    },
    shiftYear(instant, delta, siteId) {
      const parts = darianDateParts(instant, siteId)
      const time = timeOfSol(instant, siteId)
      const year = parts.year + delta
      const day = Math.min(parts.day, darianMonthLength(year, parts.month))
      return instantOnSol(darianSolIndex(year, parts.month, day), time, siteId)
    },
  }
}

function lsMonth(ls: number): number {
  return Math.min(12, Math.floor(wrapUnit(ls / 360) * 12) + 1)
}

type ClancyMonth = { year: number; month: number; first: number; last: number }

/** Sols spanned by an Ls month; `first` inclusive, `last` exclusive. */
function clancyMonthSolRange(
  year: number,
  month: number,
  siteId?: string,
): { first: number; last: number } {
  const startLs = (month - 1) * 30
  const start = dateAtLs(year, startLs)
  const end = month === 12 ? dateAtLs(year + 1, 0) : dateAtLs(year, month * 30)
  const first = Math.floor(localMsd(start, siteId))
  const last = Math.floor(localMsd(end, siteId))
  return { first, last }
}

function clancyMonthFromIndex(index: number, siteId?: string): ClancyMonth {
  const year = Math.floor(index / 12)
  const month = index - year * 12 + 1
  return { year, month, ...clancyMonthSolRange(year, month, siteId) }
}

/**
 * The Ls month that owns a whole sol. Boundaries fall mid-sol, so resolving
 * membership from the instantaneous Ls would split a sol between two months
 * and leave the grid's first cell disowned; the sol containing a crossing is
 * day 1 of the month it opens.
 */
function clancyMonthOfSol(sol: number, siteId?: string): ClancyMonth {
  const noon = dateFromLocalMsd(sol + 0.5, siteId)
  let index = clancyMarsYear(noon) * 12 + lsMonth(solarLongitude(noon)) - 1
  let current = clancyMonthFromIndex(index, siteId)
  for (let step = 0; step < 3 && (sol < current.first || sol >= current.last); step++) {
    index += sol < current.first ? -1 : 1
    current = clancyMonthFromIndex(index, siteId)
  }
  return current
}

function makeClancyDriver(): CalendarDriver {
  return {
    id: 'clancy',
    name: 'Mars Year (Ls)',
    dateParts(instant, siteId) {
      const sol = Math.floor(localMsd(instant, siteId))
      const { year, month, first } = clancyMonthOfSol(sol, siteId)
      const day = sol - first + 1
      const monthCode = `Ls${String((month - 1) * 30).padStart(3, '0')}`
      return {
        year,
        month,
        monthCode,
        day,
        key: `clancy-${year}-${monthCode}-${day}`,
      }
    },
    monthGrid(instant, _locale, siteId) {
      const parts = this.dateParts(instant, siteId)
      const time = timeOfSol(instant, siteId)
      const { first, last } = clancyMonthSolRange(parts.year, parts.month, siteId)
      const length = Math.max(1, last - first)
      const startLs = (parts.month - 1) * 30
      const endLs = parts.month * 30
      const cells: CalendarCell[] = Array.from({ length }, (_, offset) => {
        const sol = first + offset
        const day = offset + 1
        return {
          day,
          key: `clancy-${parts.year}-${parts.monthCode}-${day}`,
          instant: dateFromLocalMsd(sol + time, siteId),
          inMonth: true,
          inWindow: solInWindowFromLocal(sol, siteId),
          title: `Sol ${day} · Ls ${startLs}°–${endLs}° · MY ${parts.year}`,
        }
      })
      const ls = solarLongitude(instant)
      return {
        headingPrimary: `Ls ${startLs}°–${endLs}° · MY ${parts.year}`,
        headingSecondary: `${LS_MONTH_SEASONS[parts.month - 1]} · Ls ${ls.toFixed(1)}°`,
        columnCount: 7,
        weekdayLabels: [],
        cells,
      }
    },
    label(instant, _locale, siteId) {
      const parts = this.dateParts(instant, siteId)
      const ls = solarLongitude(instant)
      return `MY ${parts.year}, Ls ${ls.toFixed(1)}° (sol ${parts.day})`
    },
    shiftMonth(instant, delta, siteId) {
      const parts = this.dateParts(instant, siteId)
      const time = timeOfSol(instant, siteId)
      const { first, last } = clancyMonthFromIndex(
        parts.year * 12 + parts.month - 1 + delta,
        siteId,
      )
      const day = Math.min(parts.day, Math.max(1, last - first))
      return dateFromLocalMsd(first + day - 1 + time, siteId)
    },
    shiftYear(instant, delta, siteId) {
      const parts = this.dateParts(instant, siteId)
      const time = timeOfSol(instant, siteId)
      const ls = solarLongitude(instant)
      const at = dateAtLs(parts.year + delta, ls)
      return dateFromLocalMsd(Math.floor(localMsd(at, siteId)) + time, siteId)
    },
  }
}

function solInWindowFromLocal(sol: number, siteId?: string): boolean {
  const start = dateFromLocalMsd(sol, siteId).getTime()
  const end = dateFromLocalMsd(sol + 1, siteId).getTime() - 1
  return end >= ELEMENTS_VALID_FROM_MS && start <= ELEMENTS_VALID_TO_MS
}

export const marsCalendarDrivers = [makeDarianDriver(), makeClancyDriver()] as const

export const darianCalendar = marsCalendarDrivers[0]
export const clancyCalendar = marsCalendarDrivers[1]
