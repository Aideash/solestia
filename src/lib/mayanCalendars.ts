import { Temporal } from 'temporal-polyfill/full'
import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from '../data/planets.ts'
import type { CalendarDateParts, CalendarDriver, CalendarCell, MonthGrid } from './calendars.ts'
import { hostTimeZoneId } from './timeZones.ts'

/** Goodman–Martinez–Thompson correlation: 0.0.0.0.0 = JDN 584283. */
export const MAYAN_EPOCH_JDN = 584_283

export const MAYAN_NATIVE_LOCALE = 'myn'

export const TZOLKIN_NAMES = [
  'Imix',
  'Ikʼ',
  'Akʼbal',
  'Kʼan',
  'Chikchan',
  'Kimi',
  'Manikʼ',
  'Lamat',
  'Muluk',
  'Ok',
  'Chuwen',
  'Eb',
  'Ben',
  'Ix',
  'Men',
  'Kib',
  'Kaban',
  'Etzʼnab',
  'Kawak',
  'Ajaw',
] as const

export const HAAB_MONTHS = [
  'Pop',
  'Wo',
  'Sip',
  'Sotzʼ',
  'Sek',
  'Xul',
  'Yaxkʼin',
  'Mol',
  'Chʼen',
  'Yax',
  'Sak',
  'Keh',
  'Mak',
  'Kʼankʼin',
  'Muwan',
  'Pax',
  'Kʼayab',
  'Kumkʼu',
  'Wayeb',
] as const

type CivilDate = {
  year: number
  month: number
  day: number
}

export type LongCount = {
  baktun: number
  katun: number
  tun: number
  winal: number
  kin: number
}

export type CalendarRoundDate = {
  tzolkinNumber: number
  tzolkinName: (typeof TZOLKIN_NAMES)[number]
  haabMonth: (typeof HAAB_MONTHS)[number]
  haabMonthIndex: number
  haabDay: number
}

export type MayanNumeralStyle = 'unicode' | 'ascii'

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function resolvedTimeZone(timeZone?: string): string {
  return timeZone ?? hostTimeZoneId()
}

function localCivilDate(instant: Date, timeZone?: string): CivilDate {
  const zoned = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    resolvedTimeZone(timeZone),
  )
  return { year: zoned.year, month: zoned.month, day: zoned.day }
}

/** Proleptic Gregorian civil date → Julian Day Number (noon-based integer). */
export function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  )
}

export function jdnToGregorian(jdn: number): CivilDate {
  const a = jdn + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor((146097 * b) / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor((1461 * d) / 4)
  const m = Math.floor((5 * e + 2) / 153)
  const day = e - Math.floor((153 * m + 2) / 5) + 1
  const month = m + 3 - 12 * Math.floor(m / 10)
  const year = 100 * b + d - 4800 + Math.floor(m / 10)
  return { year, month, day }
}

export function civilToMayanDays(civil: CivilDate): number {
  return gregorianToJdn(civil.year, civil.month, civil.day) - MAYAN_EPOCH_JDN
}

export function mayanDaysToCivil(days: number): CivilDate {
  return jdnToGregorian(days + MAYAN_EPOCH_JDN)
}

export function longCountFromDays(days: number): LongCount {
  const kin = mod(days, 20)
  let rest = (days - kin) / 20
  const winal = mod(rest, 18)
  rest = (rest - winal) / 18
  const tun = mod(rest, 20)
  rest = (rest - tun) / 20
  const katun = mod(rest, 20)
  rest = (rest - katun) / 20
  return { baktun: rest, katun, tun, winal, kin }
}

export function daysFromLongCount(count: LongCount): number {
  return (((count.baktun * 20 + count.katun) * 20 + count.tun) * 18 + count.winal) * 20 + count.kin
}

/**
 * Day 0 is 4 Ajaw 8 Kumkʼu. Haab day-of-year offset 348 = 17×20 + 8.
 */
export function mayanCalendarRound(days: number): CalendarRoundDate {
  const tzolkinNumber = mod(days + 3, 13) + 1
  const tzolkinIndex = mod(days + 19, 20)
  const haabDayOfYear = mod(days + 348, 365)
  const haabMonthIndex = haabDayOfYear >= 360 ? 18 : Math.floor(haabDayOfYear / 20)
  const haabDay = haabDayOfYear >= 360 ? haabDayOfYear - 360 : haabDayOfYear % 20
  return {
    tzolkinNumber,
    tzolkinName: TZOLKIN_NAMES[tzolkinIndex]!,
    haabMonth: HAAB_MONTHS[haabMonthIndex]!,
    haabMonthIndex,
    haabDay,
  }
}

const ASCII_NUMERALS = [
  'Θ',
  '·',
  '··',
  '···',
  '····',
  '|',
  '·|',
  '··|',
  '···|',
  '····|',
  '||',
  '·||',
  '··||',
  '···||',
  '····||',
  '|||',
  '·|||',
  '··|||',
  '···|||',
  '····|||',
] as const

export function formatMayanNumeral(value: number, style: MayanNumeralStyle = 'unicode'): string {
  if (!Number.isInteger(value) || value < 0 || value > 19) {
    throw new RangeError(`Mayan numeral out of range: ${value}`)
  }
  if (style === 'ascii') return ASCII_NUMERALS[value]!
  return String.fromCodePoint(0x1d2e0 + value)
}

function isNative(locale?: string): boolean {
  return locale === MAYAN_NATIVE_LOCALE || Boolean(locale?.startsWith(`${MAYAN_NATIVE_LOCALE}-`))
}

function formatNumber(value: number, locale?: string): string {
  return isNative(locale) ? formatMayanNumeral(value, 'unicode') : String(value)
}

function formatLongCountHead(count: LongCount, locale?: string): string {
  return [count.baktun, count.katun, count.tun].map((n) => formatNumber(n, locale)).join('.')
}

function formatLongCountFull(count: LongCount, locale?: string): string {
  return [count.baktun, count.katun, count.tun, count.winal, count.kin]
    .map((n) => formatNumber(n, locale))
    .join('.')
}

function formatTzolkin(days: number, locale?: string): string {
  const round = mayanCalendarRound(days)
  return `${formatNumber(round.tzolkinNumber, locale)} ${round.tzolkinName}`
}

function formatHaab(days: number, locale?: string): string {
  const round = mayanCalendarRound(days)
  return `${formatNumber(round.haabDay, locale)} ${round.haabMonth}`
}

function dateAtTime(date: Temporal.PlainDate, time: Temporal.PlainTime, timeZoneId: string): Date {
  return new Date(date.toPlainDateTime(time).toZonedDateTime(timeZoneId).epochMilliseconds)
}

function civilDateAtViewedTime(civil: CivilDate, viewed: Date, timeZone?: string): Date {
  const tz = resolvedTimeZone(timeZone)
  const viewedTime = Temporal.Instant.fromEpochMilliseconds(viewed.getTime())
    .toZonedDateTimeISO(tz)
    .toPlainTime()
  return dateAtTime(
    Temporal.PlainDate.from({ year: civil.year, month: civil.month, day: civil.day }),
    viewedTime,
    tz,
  )
}

function civilDateInWindow(civil: CivilDate, timeZone?: string): boolean {
  const tz = resolvedTimeZone(timeZone)
  const date = Temporal.PlainDate.from({ year: civil.year, month: civil.month, day: civil.day })
  const start = date.toPlainDateTime().toZonedDateTime(tz).epochMilliseconds
  const end = date.add({ days: 1 }).toPlainDateTime().toZonedDateTime(tz).epochMilliseconds - 1
  return end >= ELEMENTS_VALID_FROM_MS && start <= ELEMENTS_VALID_TO_MS
}

function mayanDaysAt(instant: Date, timeZone?: string): number {
  return civilToMayanDays(localCivilDate(instant, timeZone))
}

function instantAtMayanDays(days: number, viewed: Date, timeZone?: string): Date {
  return civilDateAtViewedTime(mayanDaysToCivil(days), viewed, timeZone)
}

/** Absolute Haab month index (Wayeb = 18) counted from the epoch's Haab alignment. */
function haabAbsoluteMonth(days: number): number {
  const offset = days + 348
  const haabYear = Math.floor(offset / 365)
  const dayOfYear = mod(offset, 365)
  const monthIndex = dayOfYear >= 360 ? 18 : Math.floor(dayOfYear / 20)
  return haabYear * 19 + monthIndex
}

function daysAtHaabMonthStart(absoluteMonth: number): number {
  const haabYear = Math.floor(absoluteMonth / 19)
  const monthIndex = mod(absoluteMonth, 19)
  const dayOfYear = monthIndex === 18 ? 360 : monthIndex * 20
  return haabYear * 365 + dayOfYear - 348
}

function haabMonthLength(monthIndex: number): number {
  return monthIndex === 18 ? 5 : 20
}

type RoundParts = CalendarDateParts & {
  days: number
  tzolkinNumber: number
  tzolkinName: string
  haabMonthIndex: number
}

function roundDateParts(instant: Date, timeZone?: string): RoundParts {
  const days = mayanDaysAt(instant, timeZone)
  const round = mayanCalendarRound(days)
  const monthCode = round.haabMonthIndex === 18 ? 'wayeb' : `H${String(round.haabMonthIndex + 1).padStart(2, '0')}`
  return {
    year: Math.floor((days + 348) / 365),
    month: round.haabMonthIndex + 1,
    monthCode,
    day: round.haabDay,
    key: `mayan-cr-${days}`,
    days,
    tzolkinNumber: round.tzolkinNumber,
    tzolkinName: round.tzolkinName,
    haabMonthIndex: round.haabMonthIndex,
  }
}

type LongParts = CalendarDateParts & LongCount & { days: number }

function longDateParts(instant: Date, timeZone?: string): LongParts {
  const days = mayanDaysAt(instant, timeZone)
  const count = longCountFromDays(days)
  return {
    year: Math.floor(days / 360),
    month: count.winal + 1,
    monthCode: `W${String(count.winal).padStart(2, '0')}`,
    day: count.kin,
    key: `mayan-lc-${count.baktun}.${count.katun}.${count.tun}.${count.winal}.${count.kin}`,
    days,
    ...count,
  }
}

function makeCalendarRoundDriver(): CalendarDriver {
  return {
    id: 'mayan-calendar-round',
    name: 'Mayan Calendar Round',
    nativeLocale: MAYAN_NATIVE_LOCALE,
    dateParts: roundDateParts,
    monthGrid(instant, locale, timeZone): MonthGrid {
      const selected = roundDateParts(instant, timeZone)
      const absoluteMonth = haabAbsoluteMonth(selected.days)
      const monthStart = daysAtHaabMonthStart(absoluteMonth)
      const length = haabMonthLength(selected.haabMonthIndex)
      const monthName = HAAB_MONTHS[selected.haabMonthIndex]!
      const cells: CalendarCell[] = Array.from({ length }, (_, index) => {
        const days = monthStart + index
        const round = mayanCalendarRound(days)
        const tzolkin = formatTzolkin(days, locale)
        const haab = formatHaab(days, locale)
        return {
          day: round.haabDay,
          key: `mayan-cr-${days}`,
          instant: instantAtMayanDays(days, instant, timeZone),
          inMonth: true,
          inWindow: civilDateInWindow(mayanDaysToCivil(days), timeZone),
          label: tzolkin,
          title: `${tzolkin} · ${haab}`,
        }
      })
      return {
        headingPrimary: monthName,
        yearNav: false,
        /** Five columns keeps Tzolkin labels readable; Wayeb stays a single row. */
        columnCount: 5,
        weekdayLabels: [],
        cells,
      }
    },
    label(instant, locale, timeZone) {
      const days = mayanDaysAt(instant, timeZone)
      return `${formatTzolkin(days, locale)} ${formatHaab(days, locale)}`
    },
    shiftMonth(instant, delta, timeZone) {
      const selected = roundDateParts(instant, timeZone)
      const nextStart = daysAtHaabMonthStart(haabAbsoluteMonth(selected.days) + delta)
      const length = haabMonthLength(mayanCalendarRound(nextStart).haabMonthIndex)
      const day = Math.min(selected.day, length - 1)
      return instantAtMayanDays(nextStart + day, instant, timeZone)
    },
    shiftYear(instant) {
      return instant
    },
  }
}

function makeLongCountDriver(): CalendarDriver {
  return {
    id: 'mayan-long-count',
    name: 'Mayan Long Count',
    nativeLocale: MAYAN_NATIVE_LOCALE,
    dateParts: longDateParts,
    monthGrid(instant, locale, timeZone): MonthGrid {
      const selected = longDateParts(instant, timeZone)
      const monthStart = selected.days - selected.kin
      const cells: CalendarCell[] = Array.from({ length: 20 }, (_, kin) => {
        const days = monthStart + kin
        const count = longCountFromDays(days)
        return {
          day: kin,
          key: `mayan-lc-${count.baktun}.${count.katun}.${count.tun}.${count.winal}.${count.kin}`,
          instant: instantAtMayanDays(days, instant, timeZone),
          inMonth: true,
          inWindow: civilDateInWindow(mayanDaysToCivil(days), timeZone),
          label: isNative(locale) ? formatNumber(kin, locale) : undefined,
          title: formatLongCountFull(count, locale),
        }
      })
      return {
        headingPrimary: isNative(locale)
          ? `Winal ${formatNumber(selected.winal, locale)}`
          : `Winal ${selected.winal}`,
        headingSecondary: formatLongCountHead(selected, locale),
        columnCount: 5,
        weekdayLabels: [],
        cells,
      }
    },
    label(instant, locale, timeZone) {
      return formatLongCountFull(longDateParts(instant, timeZone), locale)
    },
    shiftMonth(instant, delta, timeZone) {
      const selected = longDateParts(instant, timeZone)
      return instantAtMayanDays(selected.days + delta * 20, instant, timeZone)
    },
    shiftYear(instant, delta, timeZone) {
      const selected = longDateParts(instant, timeZone)
      return instantAtMayanDays(selected.days + delta * 360, instant, timeZone)
    },
  }
}

export const mayanCalendarDrivers = [makeCalendarRoundDriver(), makeLongCountDriver()] as const
