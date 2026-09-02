import { Temporal } from 'temporal-polyfill/full'
import { EARTHLY_BRANCHES } from './calendars.ts'
import { hostTimeZoneId } from './timeZones.ts'

export type ClockHands = {
  major: number
  middle: number
  minor: number | null
}

export type ClockHand = 'major' | 'middle' | 'minor'

export type ClockPeriods = {
  major: number
  middle: number
  minor: number | null
}

export type ClockNumeral = {
  key: string
  text: string
  fraction: number
}

export type ClockDial = {
  majorTicks: number
  minorTicks: number
  numeralEvery: number
}

export type ClockDriver = {
  id: string
  name: string
  nativeLocale?: string
  dial: ClockDial
  /** Milliseconds each hand takes to complete one revolution. */
  periods: ClockPeriods
  /** Milliseconds elapsed in this clock's own day frame. */
  frameMs(at: Date, timeZone?: string): number
  numerals(locale?: string): ClockNumeral[]
  hands(at: Date, timeZone?: string): ClockHands
  label(at: Date, locale?: string, timeZone?: string): string
}

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000
const BIEL_OFFSET_MS = MS_PER_HOUR

function zonedAt(at: Date, timeZone?: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(
    timeZone ?? hostTimeZoneId(),
  )
}

function localDayMs(at: Date, timeZone?: string): number {
  const zoned = zonedAt(at, timeZone)
  return zoned.hour * MS_PER_HOUR + zoned.minute * 60_000 + zoned.second * 1000 + zoned.millisecond
}

function localDayFraction(at: Date, timeZone?: string): number {
  return localDayMs(at, timeZone) / MS_PER_DAY
}

function bielDayMs(at: Date): number {
  return (((at.getTime() + BIEL_OFFSET_MS) % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY
}

function zoneName(at: Date, timeZone?: string): string {
  const part = new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone ?? hostTimeZoneId(),
    timeZoneName: 'short',
  })
    .formatToParts(at)
    .find((entry) => entry.type === 'timeZoneName')
  return part?.value ?? ''
}

function withZone(text: string, at: Date, timeZone?: string): string {
  const zone = zoneName(at, timeZone)
  return zone ? `${text} ${zone}` : text
}

function isChineseLocale(locale?: string): boolean {
  if (!locale) return false
  const resolved = new Intl.DateTimeFormat(locale).resolvedOptions().locale
  return resolved === 'zh' || resolved.startsWith('zh-')
}

function numberedNumerals(
  count: number,
  every: number,
  textAt: (index: number) => string,
): ClockNumeral[] {
  return Array.from({ length: count }, (_, index) => {
    if (index % every !== 0) return null
    return {
      key: String(index),
      text: textAt(index),
      fraction: index / count,
    }
  }).filter((numeral) => numeral !== null)
}

function civil12Hands(at: Date, timeZone?: string): ClockHands {
  const zoned = zonedAt(at, timeZone)
  const hours = zoned.hour
  const minutes = zoned.minute
  const seconds = zoned.second + zoned.millisecond / 1000
  return {
    major: ((hours % 12) + minutes / 60 + seconds / 3600) / 12,
    middle: (minutes + seconds / 60) / 60,
    minor: seconds / 60,
  }
}

function civil24Hands(at: Date, timeZone?: string): ClockHands {
  const zoned = zonedAt(at, timeZone)
  const hours = zoned.hour
  const minutes = zoned.minute
  const seconds = zoned.second + zoned.millisecond / 1000
  return {
    major: (hours + minutes / 60 + seconds / 3600) / 24,
    middle: (minutes + seconds / 60) / 60,
    minor: seconds / 60,
  }
}

const civil12: ClockDriver = {
  id: 'civil-12',
  name: 'Civil 12-hour',
  dial: { majorTicks: 12, minorTicks: 60, numeralEvery: 1 },
  periods: { major: 12 * MS_PER_HOUR, middle: MS_PER_HOUR, minor: MS_PER_MINUTE },
  frameMs: localDayMs,
  numerals() {
    return numberedNumerals(12, 1, (index) => (index === 0 ? '12' : String(index)))
  },
  hands: civil12Hands,
  label(at, _locale, timeZone) {
    const digital = at.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZone: timeZone ?? hostTimeZoneId(),
    })
    return withZone(digital, at, timeZone)
  },
}

const civil24: ClockDriver = {
  id: 'civil-24',
  name: 'Civil 24-hour',
  dial: { majorTicks: 24, minorTicks: 60, numeralEvery: 1 },
  periods: { major: MS_PER_DAY, middle: MS_PER_HOUR, minor: MS_PER_MINUTE },
  frameMs: localDayMs,
  numerals() {
    return numberedNumerals(24, 1, (index) => String(index))
  },
  hands: civil24Hands,
  label(at, _locale, timeZone) {
    const digital = at.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZone: timeZone ?? hostTimeZoneId(),
    })
    return withZone(digital, at, timeZone)
  },
}

const metric: ClockDriver = {
  id: 'metric',
  name: 'Metric (decimal)',
  dial: { majorTicks: 10, minorTicks: 100, numeralEvery: 1 },
  periods: { major: MS_PER_DAY, middle: MS_PER_DAY / 10, minor: MS_PER_DAY / 1000 },
  frameMs: localDayMs,
  numerals() {
    return numberedNumerals(10, 1, (index) => (index === 0 ? '10' : String(index)))
  },
  hands(at, timeZone) {
    const fraction = localDayFraction(at, timeZone)
    const hours = fraction * 10
    const minutes = (hours % 1) * 100
    const seconds = (minutes % 1) * 100
    return {
      major: hours / 10,
      middle: minutes / 100,
      minor: seconds / 100,
    }
  },
  label(at, _locale, timeZone) {
    const hours = localDayFraction(at, timeZone) * 10
    const hour = Math.floor(hours)
    const minutes = (hours - hour) * 100
    const minute = Math.floor(minutes)
    const second = Math.floor((minutes - minute) * 100)
    return `${hour}h ${String(minute).padStart(2, '0')}m ${String(second).padStart(2, '0')}s`
  },
}

const indian: ClockDriver = {
  id: 'indian',
  name: 'Indian (muhurta)',
  dial: { majorTicks: 30, minorTicks: 30, numeralEvery: 5 },
  periods: { major: MS_PER_DAY, middle: MS_PER_DAY / 30, minor: MS_PER_DAY / 900 },
  frameMs: localDayMs,
  numerals() {
    return numberedNumerals(30, 5, (index) => String(index))
  },
  hands(at, timeZone) {
    const muhurta = localDayFraction(at, timeZone) * 30
    const kala = (muhurta % 1) * 30
    const kastha = (kala % 1) * 30
    return {
      major: muhurta / 30,
      middle: kala / 30,
      minor: kastha / 30,
    }
  },
  label(at, _locale, timeZone) {
    const muhurta = localDayFraction(at, timeZone) * 30
    const kala = (muhurta % 1) * 30
    const kastha = (kala % 1) * 30
    return `muhurta ${Math.floor(muhurta)}, kala ${Math.floor(kala)}, kastha ${Math.floor(kastha)}`
  },
}

function chineseShiOffset(at: Date, timeZone?: string): number {
  return (localDayMs(at, timeZone) + MS_PER_HOUR) % MS_PER_DAY
}

function chineseBranchIndex(at: Date, timeZone?: string): number {
  return Math.floor(chineseShiOffset(at, timeZone) / (2 * MS_PER_HOUR)) % 12
}

function chineseBranchName(index: number, locale?: string): string {
  const branch = EARTHLY_BRANCHES[index]
  if (!branch) return String(index)
  return isChineseLocale(locale) ? branch.keys[1] : capitalize(branch.keys[0])
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

const chineseShi: ClockDriver = {
  id: 'chinese-shi',
  name: 'Chinese (shichen)',
  nativeLocale: 'zh',
  dial: { majorTicks: 12, minorTicks: 8, numeralEvery: 1 },
  periods: { major: MS_PER_DAY, middle: 2 * MS_PER_HOUR, minor: 15 * MS_PER_MINUTE },
  frameMs: chineseShiOffset,
  numerals(locale) {
    return EARTHLY_BRANCHES.map((branch, index) => ({
      key: branch.keys[0],
      text: chineseBranchName(index, locale),
      fraction: index / 12,
    }))
  },
  hands(at, timeZone) {
    const shi = chineseShiOffset(at, timeZone) / (2 * MS_PER_HOUR)
    const ke = (shi % 1) * 8
    const fen = (ke % 1) * 15
    return {
      major: shi / 12,
      middle: ke / 8,
      minor: fen / 15,
    }
  },
  label(at, locale, timeZone) {
    const shi = chineseShiOffset(at, timeZone) / (2 * MS_PER_HOUR)
    const ke = (shi % 1) * 8
    const fen = (ke % 1) * 15
    const branch = chineseBranchName(chineseBranchIndex(at, timeZone), locale)
    return `${branch}, ke ${Math.floor(ke)}, fen ${Math.floor(fen)}`
  },
}

const swatch: ClockDriver = {
  id: 'swatch',
  name: 'Swatch (.beat)',
  dial: { majorTicks: 10, minorTicks: 100, numeralEvery: 1 },
  periods: { major: MS_PER_DAY, middle: MS_PER_DAY / 10, minor: MS_PER_DAY / 1000 },
  frameMs: bielDayMs,
  numerals() {
    return numberedNumerals(10, 1, (index) => String(index * 100))
  },
  hands(at) {
    const beats = bielDayMs(at) / 86_400
    const beatInHundred = beats % 100
    return {
      major: beats / 1000,
      middle: beatInHundred / 100,
      minor: (beats % 1) / 1,
    }
  },
  label(at) {
    const beats = bielDayMs(at) / 86_400
    const whole = Math.floor(beats)
    const tenths = Math.floor((beats - whole) * 10)
    return `@${String(whole).padStart(3, '0')}.${tenths}`
  },
}

/**
 * Moves `at` so the named hand points at `fraction` of a turn, taking the short
 * way around: the result is the instant nearest `at` that satisfies the angle.
 * Coarser hands therefore carry when a finer hand is wound past the top, and
 * finer hands follow a coarser one, the way a geared movement behaves.
 *
 * The residue is read from the driver's wall-clock frame while the delta is
 * applied to the absolute instant, so a single step across a DST transition
 * would land an hour off. Drags arrive as many small steps, which keeps each
 * one far shorter than the gap that would need to be crossed.
 */
export function withHandAt(
  driver: ClockDriver,
  at: Date,
  hand: ClockHand,
  fraction: number,
  timeZone?: string,
): Date {
  const period = driver.periods[hand]
  if (period === null) return at
  const residue = modulo(driver.frameMs(at, timeZone), period)
  const target = modulo(fraction, 1) * period
  const delta = modulo(target - residue + period / 2, period) - period / 2
  return new Date(at.getTime() + delta)
}

function modulo(value: number, span: number): number {
  return ((value % span) + span) % span
}

export const clockDrivers = [civil12, civil24, metric, indian, chineseShi, swatch] as const

export const civil12Clock = clockDrivers[0]
