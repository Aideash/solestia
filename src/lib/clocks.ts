import { EARTHLY_BRANCHES } from './calendars.ts'

export type ClockHands = {
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
  numerals(locale?: string): ClockNumeral[]
  hands(at: Date): ClockHands
  label(at: Date, locale?: string): string
}

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000
const BIEL_OFFSET_MS = MS_PER_HOUR

function localDayMs(at: Date): number {
  return (
    at.getHours() * MS_PER_HOUR +
    at.getMinutes() * 60_000 +
    at.getSeconds() * 1000 +
    at.getMilliseconds()
  )
}

function localDayFraction(at: Date): number {
  return localDayMs(at) / MS_PER_DAY
}

function bielDayMs(at: Date): number {
  return (((at.getTime() + BIEL_OFFSET_MS) % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY
}

function zoneName(at: Date): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(at)
    .find((entry) => entry.type === 'timeZoneName')
  return part?.value ?? ''
}

function withZone(text: string, at: Date): string {
  const zone = zoneName(at)
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

function civil12Hands(at: Date): ClockHands {
  const hours = at.getHours()
  const minutes = at.getMinutes()
  const seconds = at.getSeconds() + at.getMilliseconds() / 1000
  return {
    major: ((hours % 12) + minutes / 60 + seconds / 3600) / 12,
    middle: (minutes + seconds / 60) / 60,
    minor: seconds / 60,
  }
}

function civil24Hands(at: Date): ClockHands {
  const hours = at.getHours()
  const minutes = at.getMinutes()
  const seconds = at.getSeconds() + at.getMilliseconds() / 1000
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
  numerals() {
    return numberedNumerals(12, 1, (index) => (index === 0 ? '12' : String(index)))
  },
  hands: civil12Hands,
  label(at) {
    const digital = at.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    })
    return withZone(digital, at)
  },
}

const civil24: ClockDriver = {
  id: 'civil-24',
  name: 'Civil 24-hour',
  dial: { majorTicks: 24, minorTicks: 60, numeralEvery: 1 },
  numerals() {
    return numberedNumerals(24, 1, (index) => String(index))
  },
  hands: civil24Hands,
  label(at) {
    const digital = at.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    return withZone(digital, at)
  },
}

const metric: ClockDriver = {
  id: 'metric',
  name: 'Metric (decimal)',
  dial: { majorTicks: 10, minorTicks: 100, numeralEvery: 1 },
  numerals() {
    return numberedNumerals(10, 1, (index) => (index === 0 ? '10' : String(index)))
  },
  hands(at) {
    const fraction = localDayFraction(at)
    const hours = fraction * 10
    const minutes = (hours % 1) * 100
    const seconds = (minutes % 1) * 100
    return {
      major: hours / 10,
      middle: minutes / 100,
      minor: seconds / 100,
    }
  },
  label(at) {
    const hours = localDayFraction(at) * 10
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
  numerals() {
    return numberedNumerals(30, 5, (index) => String(index))
  },
  hands(at) {
    const muhurta = localDayFraction(at) * 30
    const kala = (muhurta % 1) * 30
    const kastha = (kala % 1) * 30
    return {
      major: muhurta / 30,
      middle: kala / 30,
      minor: kastha / 30,
    }
  },
  label(at) {
    const muhurta = localDayFraction(at) * 30
    const kala = (muhurta % 1) * 30
    const kastha = (kala % 1) * 30
    return `muhurta ${Math.floor(muhurta)}, kala ${Math.floor(kala)}, kastha ${Math.floor(kastha)}`
  },
}

function chineseShiOffset(at: Date): number {
  return (localDayMs(at) + MS_PER_HOUR) % MS_PER_DAY
}

function chineseBranchIndex(at: Date): number {
  return Math.floor(chineseShiOffset(at) / (2 * MS_PER_HOUR)) % 12
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
  numerals(locale) {
    return EARTHLY_BRANCHES.map((branch, index) => ({
      key: branch.keys[0],
      text: chineseBranchName(index, locale),
      fraction: index / 12,
    }))
  },
  hands(at) {
    const shi = chineseShiOffset(at) / (2 * MS_PER_HOUR)
    const ke = (shi % 1) * 8
    const fen = (ke % 1) * 15
    return {
      major: shi / 12,
      middle: ke / 8,
      minor: fen / 15,
    }
  },
  label(at, locale) {
    const shi = chineseShiOffset(at) / (2 * MS_PER_HOUR)
    const ke = (shi % 1) * 8
    const fen = (ke % 1) * 15
    const branch = chineseBranchName(chineseBranchIndex(at), locale)
    return `${branch}, ke ${Math.floor(ke)}, fen ${Math.floor(fen)}`
  },
}

const swatch: ClockDriver = {
  id: 'swatch',
  name: 'Swatch (.beat)',
  dial: { majorTicks: 10, minorTicks: 100, numeralEvery: 1 },
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

export const clockDrivers = [civil12, civil24, metric, indian, chineseShi, swatch] as const

export const civil12Clock = clockDrivers[0]
