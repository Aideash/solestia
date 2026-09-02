import { marsSite } from '../data/marsSites.ts'
import { julianDate } from './kepler.ts'

/** Mean solar day on Mars, Earth days (Allison & McEwen 2000 / NASA Mars24). */
export const MARS_SOL_DAYS = 1.0274912517
export const MS_PER_DAY = 86_400_000
export const MS_PER_SOL = MARS_SOL_DAYS * MS_PER_DAY
export const MS_PER_MARS_HOUR = MS_PER_SOL / 24
export const MS_PER_MARS_MINUTE = MS_PER_SOL / (24 * 60)

const UNIX_EPOCH_JD = 2_440_587.5
const J2000_JD = 2_451_545.0
const TT_MINUS_TAI = 32.184
const DEG = Math.PI / 180

/**
 * MSD epoch alignment from Mars24:
 * MSD = (JD_TT − 2451549.5) / 1.0274912517 + 44796.0 − 0.00096
 */
const MSD_JD_TT_REF = 2_451_549.5
const MSD_AT_REF = 44_796.0
const MSD_SHIFT = 0.00096

/** Clancy Mars Year 1 northern spring equinox (JD TT ≈ 1955-04-11). */
export const CLANCY_MY1_JD = 2_435_208.456
/** Mean Ls rate from Allison; 360° / 0.52403840 °/day. */
export const MARS_TROPICAL_DAYS = 360 / 0.5240384

/**
 * MSD of 1 Sagittarius 0, 00:00 MTC. Allison's MSD 0 falls on 25 Virgo 140
 * (Mars Julian sol 94128).
 */
export const DARIAN_MSD_EPOCH = -94_127

/** UTC instants when TAI−UTC stepped, with the new offset in seconds. */
const TAI_MINUS_UTC: readonly [number, number][] = [
  [Date.UTC(1972, 0, 1), 10],
  [Date.UTC(1972, 6, 1), 11],
  [Date.UTC(1973, 0, 1), 12],
  [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14],
  [Date.UTC(1976, 0, 1), 15],
  [Date.UTC(1977, 0, 1), 16],
  [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18],
  [Date.UTC(1980, 0, 1), 19],
  [Date.UTC(1981, 6, 1), 20],
  [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22],
  [Date.UTC(1985, 6, 1), 23],
  [Date.UTC(1988, 0, 1), 24],
  [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26],
  [Date.UTC(1992, 6, 1), 27],
  [Date.UTC(1993, 6, 1), 28],
  [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30],
  [Date.UTC(1997, 6, 1), 31],
  [Date.UTC(1999, 0, 1), 32],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2017, 0, 1), 37],
]

const PBS_TERMS = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
] as const

export function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1
}

export function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

function taiMinusUtc(ms: number): number {
  for (let i = TAI_MINUS_UTC.length - 1; i >= 0; i--) {
    const step = TAI_MINUS_UTC[i]
    if (step && ms >= step[0]) return step[1]
  }
  return 10
}

export function ttMinusUtcSeconds(at: Date): number {
  return taiMinusUtc(at.getTime()) + TT_MINUS_TAI
}

export function julianDateTt(at: Date): number {
  return julianDate(at) + ttMinusUtcSeconds(at) / 86_400
}

export function marsSolDate(at: Date): number {
  return (julianDateTt(at) - MSD_JD_TT_REF) / MARS_SOL_DAYS + MSD_AT_REF - MSD_SHIFT
}

/** Coordinated Mars Time as a fraction of a sol (Airy Mean Time). */
export function mtcFraction(at: Date): number {
  return wrapUnit(marsSolDate(at))
}

export function longitudeEast(siteId?: string): number {
  return marsSite(siteId).longitudeEast
}

/** Local mean solar time as a fraction of a sol at the site. */
export function lmstFraction(at: Date, siteId?: string): number {
  return wrapUnit(marsSolDate(at) + longitudeEast(siteId) / 360)
}

export function localMsd(at: Date, siteId?: string): number {
  return marsSolDate(at) + longitudeEast(siteId) / 360
}

export function dateFromMsd(msd: number): Date {
  const jdTt = (msd - MSD_AT_REF + MSD_SHIFT) * MARS_SOL_DAYS + MSD_JD_TT_REF
  let jdUt = jdTt - 64.184 / 86_400
  for (let i = 0; i < 3; i++) {
    const guess = new Date((jdUt - UNIX_EPOCH_JD) * MS_PER_DAY)
    jdUt = jdTt - ttMinusUtcSeconds(guess) / 86_400
  }
  return new Date((jdUt - UNIX_EPOCH_JD) * MS_PER_DAY)
}

export function dateFromLocalMsd(local: number, siteId?: string): Date {
  return dateFromMsd(local - longitudeEast(siteId) / 360)
}

function pbs(daysFromJ2000: number): number {
  return PBS_TERMS.reduce(
    (sum, [amp, rate, phase]) => sum + amp * Math.cos((rate * daysFromJ2000 + phase) * DEG),
    0,
  )
}

/** Areocentric solar longitude Ls in degrees, Allison & McEwen / Mars24. */
export function solarLongitude(at: Date): number {
  return solarLongitudeFromJdTt(julianDateTt(at))
}

export function solarLongitudeFromJdTt(jdTt: number): number {
  const d = jdTt - J2000_JD
  const M = (19.387 + 0.52402075 * d) * DEG
  const alphaFms = 270.3863 + 0.5240384 * d
  const eq = (10.691 + 3e-7 * d) * Math.sin(M)
  const ls =
    alphaFms +
    eq +
    0.623 * Math.sin(2 * M) +
    0.05 * Math.sin(3 * M) +
    0.005 * Math.sin(4 * M) +
    0.0005 * Math.sin(5 * M) +
    pbs(d)
  return wrapDegrees(ls)
}

/** Clancy Mars Year; MY 1 begins at the 1955 northern spring equinox. */
export function clancyMarsYear(at: Date): number {
  return clancyMarsYearFromJdTt(julianDateTt(at), solarLongitude(at))
}

export function clancyMarsYearFromJdTt(jdTt: number, ls: number): number {
  const lastEquinox = jdTt - (ls / 360) * MARS_TROPICAL_DAYS
  return Math.round((lastEquinox - CLANCY_MY1_JD) / MARS_TROPICAL_DAYS) + 1
}

export function julianDateTtAtLs(marsYear: number, ls: number): number {
  const target = wrapDegrees(ls)
  const guess =
    CLANCY_MY1_JD + (marsYear - 1) * MARS_TROPICAL_DAYS + (target / 360) * MARS_TROPICAL_DAYS
  let low = guess - 20
  let high = guess + 20
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    let value = solarLongitudeFromJdTt(mid)
    if (target === 0 && value > 180) value -= 360
    if (target > 300 && value < 60) value += 360
    if (value < target) low = mid
    else high = mid
  }
  return (low + high) / 2
}

export function dateAtLs(marsYear: number, ls: number): Date {
  const jdTt = julianDateTtAtLs(marsYear, ls)
  let jdUt = jdTt - 64.184 / 86_400
  for (let i = 0; i < 3; i++) {
    const guess = new Date((jdUt - UNIX_EPOCH_JD) * MS_PER_DAY)
    jdUt = jdTt - ttMinusUtcSeconds(guess) / 86_400
  }
  return new Date((jdUt - UNIX_EPOCH_JD) * MS_PER_DAY)
}

export function formatSolClock(fraction: number): string {
  const total = wrapUnit(fraction) * 86_400
  const hour = Math.floor(total / 3600)
  const minute = Math.floor((total - hour * 3600) / 60)
  const second = Math.floor(total - hour * 3600 - minute * 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

export function meanTimeLabel(at: Date, siteId?: string): string {
  const zone = marsSite(siteId).id === 'airy' ? 'MTC' : 'LMST'
  return `${formatSolClock(lmstFraction(at, siteId))} ${zone}`
}
