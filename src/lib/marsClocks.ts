import { marsSite } from '../data/marsSites.ts'
import type { ClockDriver, ClockHands, ClockNumeral } from './clocks.ts'
import { solarSystemAt } from './kepler.ts'
import {
  formatSolClock,
  lmstFraction,
  longitudeEast,
  MS_PER_MARS_HOUR,
  MS_PER_MARS_MINUTE,
  MS_PER_SOL,
  wrapUnit,
} from './marsTime.ts'

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

function meanHands(fraction: number, hoursOnDial: number): ClockHands {
  const total = wrapUnit(fraction) * 24
  const hour = total % hoursOnDial
  const minute = (total * 60) % 60
  const second = (total * 3600) % 60
  return {
    major: hour / hoursOnDial,
    middle: minute / 60,
    minor: second / 60,
  }
}

function apparentFraction(at: Date, siteId?: string): number {
  const mars = solarSystemAt(at).planets.find((planet) => planet.id === 'mars')
  if (!mars) return lmstFraction(at, siteId)
  return wrapUnit(mars.dayFraction + longitudeEast(siteId) / 360)
}

function meanZone(siteId?: string): 'MTC' | 'LMST' {
  return marsSite(siteId).id === 'airy' ? 'MTC' : 'LMST'
}

function meanFrameMs(at: Date, siteId?: string): number {
  return lmstFraction(at, siteId) * MS_PER_SOL
}

const mean24: ClockDriver = {
  id: 'mars-mean-24',
  name: 'Mean 24-hour',
  dial: { majorTicks: 24, minorTicks: 60, numeralEvery: 1 },
  periods: { major: MS_PER_SOL, middle: MS_PER_MARS_HOUR, minor: MS_PER_MARS_MINUTE },
  frameMs: meanFrameMs,
  numerals() {
    return numberedNumerals(24, 1, (index) => String(index))
  },
  hands(at, siteId) {
    return meanHands(lmstFraction(at, siteId), 24)
  },
  label(at, _locale, siteId) {
    return `${formatSolClock(lmstFraction(at, siteId))} ${meanZone(siteId)}`
  },
}

const mean12: ClockDriver = {
  id: 'mars-mean-12',
  name: 'Mean 12-hour',
  dial: { majorTicks: 12, minorTicks: 60, numeralEvery: 1 },
  periods: { major: 12 * MS_PER_MARS_HOUR, middle: MS_PER_MARS_HOUR, minor: MS_PER_MARS_MINUTE },
  frameMs: meanFrameMs,
  numerals() {
    return numberedNumerals(12, 1, (index) => (index === 0 ? '12' : String(index)))
  },
  hands(at, siteId) {
    return meanHands(lmstFraction(at, siteId), 12)
  },
  label(at, _locale, siteId) {
    const total = wrapUnit(lmstFraction(at, siteId)) * 24
    const hour24 = Math.floor(total)
    const minute = Math.floor((total - hour24) * 60)
    const second = Math.floor(((total - hour24) * 60 - minute) * 60)
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
    const suffix = hour24 < 12 ? 'AM' : 'PM'
    return `${hour12}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} ${suffix} ${meanZone(siteId)}`
  },
}

const apparent24: ClockDriver = {
  id: 'mars-apparent-24',
  name: 'Apparent 24-hour',
  dial: { majorTicks: 24, minorTicks: 60, numeralEvery: 1 },
  periods: { major: MS_PER_SOL, middle: MS_PER_MARS_HOUR, minor: MS_PER_MARS_MINUTE },
  frameMs(at, siteId) {
    return apparentFraction(at, siteId) * MS_PER_SOL
  },
  numerals() {
    return numberedNumerals(24, 1, (index) => String(index))
  },
  hands(at, siteId) {
    return meanHands(apparentFraction(at, siteId), 24)
  },
  label(at, _locale, siteId) {
    return `${formatSolClock(apparentFraction(at, siteId))} LTST`
  },
}

export const marsClockDrivers = [mean24, mean12, apparent24] as const

export const marsMean24Clock = mean24
