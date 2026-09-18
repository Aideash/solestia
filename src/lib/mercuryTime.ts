import { mercurySite } from '../data/mercurySites.ts'
import { PLANETS } from '../data/planets.ts'

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000
const J2000_JD = 2_451_545.0
const UNIX_EPOCH_JD = 2_440_587.5
const J2000_MS = (J2000_JD - UNIX_EPOCH_JD) * MS_PER_DAY

const mercury = PLANETS.find((planet) => planet.id === 'mercury')
if (!mercury) throw new Error('Mercury orbital elements are missing')

const { L0, LDot, varpi0, varpiDot } = mercury.elements
/** Anomalistic mean motion, degrees per day. */
const MEAN_MOTION_DEG_PER_DAY = (LDot - varpiDot) / 36_525
/** Mean anomaly at J2000, degrees in [0, 360). */
const MEAN_ANOMALY_J2000_DEG = (((L0 - varpi0) % 360) + 360) % 360

/**
 * Mean perihelion nearest J2000 (anomaly 0). Phase calendar epoch: Tezcatlipoca,
 * cycle 1, Tonatiuh, mean midnight by fiat.
 */
export const PHASE_EPOCH_MS = Math.round(
  J2000_MS - (MEAN_ANOMALY_J2000_DEG / MEAN_MOTION_DEG_PER_DAY) * MS_PER_DAY,
)

/** Ryzov Mercurial calendar epoch (Mariner 10 / poster): 1974-03-29 UTC midnight. */
export const RYZOV_EPOCH_MS = Date.UTC(1974, 2, 29)

export const MERCURY_YEAR_DAYS = 360 / MEAN_MOTION_DEG_PER_DAY

export const PHASES_PER_YEAR = 3
export const PHASES_PER_SOL = 6
export const CYCLES_PER_PHASE = 30
export const CYCLES_PER_SOL = 180
export const CYCLES_PER_YEAR = 90

/** Cycle length rounded to whole ms so civil packing stays integer-exact. */
export const MS_PER_CYCLE = Math.round((MERCURY_YEAR_DAYS * MS_PER_DAY) / CYCLES_PER_YEAR)
export const MS_PER_PHASE = MS_PER_CYCLE * CYCLES_PER_PHASE
export const MS_PER_MERCURY_YEAR = MS_PER_CYCLE * CYCLES_PER_YEAR
/** Civil mean solar day via the 3:2 identity: two anomalistic years. */
export const MS_PER_MERCURY_SOL = MS_PER_MERCURY_YEAR * 2

export const PHASE_NAMES = [
  { short: 'Tezcat', long: 'Tezcatlipoca' },
  { short: 'Piltzin', long: 'Piltzintecuhtli' },
  { short: 'Huitzi', long: 'Huitzilopochtli' },
  { short: 'Xiuhte', long: 'Xiuhtecuhtli' },
  { short: 'Chanti', long: 'Chantico' },
  { short: 'Mictlan', long: 'Mictlantecuhtli' },
] as const

export const PHASE_WEEKDAYS = [
  { short: 'Tona', long: 'Tonatiuh' },
  { short: 'Meztli', long: 'Meztli' },
  { short: 'Xolotl', long: 'Xolotl' },
  { short: 'Atlahua', long: 'Atlahua' },
  { short: 'Centeotl', long: 'Centeotl' },
  { short: 'Tlalte', long: 'Tlaltecuhtli' },
] as const

export const RYZOV_WEEKDAYS = [
  { short: 'PRM', long: 'Primis' },
  { short: 'SEC', long: 'Secundus' },
  { short: 'TER', long: 'Tertius' },
  { short: 'QRT', long: 'Quartus' },
  { short: 'QUI', long: 'Quintus' },
  { short: 'SXT', long: 'Sextus' },
  { short: 'SPT', long: 'Septimus' },
  { short: 'OCT', long: 'Octavus' },
] as const

export const RYZOV_WEEKS = [
  { short: 'GEM', long: 'Gemini' },
  { short: 'HRM', long: 'Hermes' },
  { short: 'THT', long: 'Thoth' },
  { short: 'CHX', long: 'Chenxing' },
  { short: 'NAB', long: 'Nabu' },
  { short: 'BUD', long: 'Budha' },
  { short: 'TUR', long: 'Turms' },
  { short: 'WOD', long: 'Wodan' },
  { short: 'LUG', long: 'Lugus' },
  { short: 'ATN', long: 'Aten' },
  { short: 'STB', long: 'Stilbon' },
  { short: 'APO', long: 'Apollo' },
  { short: 'SBG', long: 'Sebeg' },
  { short: 'BLN', long: 'Belenus' },
  { short: 'HLO', long: 'Helios' },
  { short: 'HOR', long: 'Horus' },
  { short: 'LUX', long: 'Luxing' },
  { short: 'SHM', long: 'Shamash' },
  { short: 'SRY', long: 'Surya' },
  { short: 'USL', long: 'Usil' },
  { short: 'SUN', long: 'Sunna' },
  { short: 'VRG', long: 'Virgo' },
] as const

export const RYZOV_DATES_PER_WEEK = 8
export const RYZOV_WEEKS_PER_CYCLE = 22
export const RYZOV_DATES_PER_CYCLE = RYZOV_DATES_PER_WEEK * RYZOV_WEEKS_PER_CYCLE

export function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1
}

export function longitudeEast(siteId?: string): number {
  return mercurySite(siteId).longitudeEast
}

/** Discrete Phases calendar zone: `floor(6 * lonEast / 360)`. */
export function phaseZoneForLongitude(longitudeEastDeg: number): number {
  return Math.floor((PHASES_PER_SOL * longitudeEastDeg) / 360)
}

export function phaseZone(siteId?: string): number {
  return phaseZoneForLongitude(longitudeEast(siteId))
}

/** Discrete Ryzov calendar zone: `floor(22 * lonEast / 360)`. */
export function ryzovWeekZoneForLongitude(longitudeEastDeg: number): number {
  return Math.floor((RYZOV_WEEKS_PER_CYCLE * longitudeEastDeg) / 360)
}

export function ryzovWeekZone(siteId?: string): number {
  return ryzovWeekZoneForLongitude(longitudeEast(siteId))
}

/** Continuous mean years since the phase epoch (perihelion = 0). */
export function meanYearsSinceEpoch(at: Date): number {
  return (at.getTime() - PHASE_EPOCH_MS) / MS_PER_MERCURY_YEAR
}

export function meanYearFraction(at: Date): number {
  return wrapUnit(meanYearsSinceEpoch(at))
}

/** Civil mean solar day fraction at the IAU prime meridian (two years per sol). */
export function meanSolFraction(at: Date): number {
  return wrapUnit(meanYearsSinceEpoch(at) / 2)
}

/** Local mean solar day fraction: 0 at local midnight, 0.5 at local noon. */
export function localMeanSolFraction(at: Date, siteId?: string): number {
  return wrapUnit(meanYearsSinceEpoch(at) / 2 + longitudeEast(siteId) / 360)
}

export type PhaseParts = {
  /** 0-based civil solar day since the phase epoch. */
  solIndex: number
  /** Phase within the sol, 0–5. */
  phase: number
  /** Cycle within the phase, 1–30. */
  cycle: number
  /** 0-based cycle index in the site's local calendar. */
  cycleIndex: number
  weekday: number
  timeOfCycle: number
}

function phasePartsFromCycleIndex(cycleIndex: number, timeOfCycle: number): PhaseParts {
  const solIndex = Math.floor(cycleIndex / CYCLES_PER_SOL)
  const cycleInSol = ((cycleIndex % CYCLES_PER_SOL) + CYCLES_PER_SOL) % CYCLES_PER_SOL
  const phase = Math.floor(cycleInSol / CYCLES_PER_PHASE)
  const cycle = (cycleInSol % CYCLES_PER_PHASE) + 1
  const weekday =
    ((cycleIndex % PHASE_WEEKDAYS.length) + PHASE_WEEKDAYS.length) % PHASE_WEEKDAYS.length
  return { solIndex, phase, cycle, cycleIndex, weekday, timeOfCycle }
}

export function phaseParts(at: Date, siteId?: string): PhaseParts {
  const ms = at.getTime() - PHASE_EPOCH_MS
  const globalCycleIndex = Math.floor(ms / MS_PER_CYCLE)
  const timeOfCycle = (ms - globalCycleIndex * MS_PER_CYCLE) / MS_PER_CYCLE
  const localCycleIndex = globalCycleIndex + phaseZone(siteId) * CYCLES_PER_PHASE
  return phasePartsFromCycleIndex(localCycleIndex, timeOfCycle)
}

export function dateFromCycleIndex(cycleIndex: number, timeOfCycle: number): Date {
  return new Date(PHASE_EPOCH_MS + cycleIndex * MS_PER_CYCLE + wrapUnit(timeOfCycle) * MS_PER_CYCLE)
}

/** Convert a site-local cycle index back to UTC. */
export function dateFromLocalCycleIndex(
  localCycleIndex: number,
  timeOfCycle: number,
  siteId?: string,
): Date {
  return dateFromCycleIndex(localCycleIndex - phaseZone(siteId) * CYCLES_PER_PHASE, timeOfCycle)
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

/**
 * Hours on Ryzov date 176 (Virgo Octavus). Odd cycles 25, even 26, every
 * 128th cycle no leap (24). Cycle 1 begins at the Ryzov epoch.
 */
export function ryzovLeapHours(cycleNumber: number): number {
  if (mod(cycleNumber, 128) === 0) return 24
  return mod(cycleNumber, 2) === 1 ? 25 : 26
}

export function ryzovCycleLengthMs(cycleNumber: number): number {
  return (RYZOV_DATES_PER_CYCLE - 1) * 24 * MS_PER_HOUR + ryzovLeapHours(cycleNumber) * MS_PER_HOUR
}

export type RyzovParts = {
  /** Cycle number (1 at the Ryzov epoch). */
  cycle: number
  /** Week within the cycle, 1–22. */
  week: number
  /** Date within the week, 1–8. */
  date: number
  /** Absolute date index within the cycle, 1–176. */
  dateOfCycle: number
  /** Elapsed fraction of the current date [0, 1). */
  timeOfDate: number
  /** Length of the current date in ms (accounts for leap hours on date 176). */
  dateLengthMs: number
}

function ryzovMsIntoCalendar(at: Date): number {
  return at.getTime() - RYZOV_EPOCH_MS
}

/** Mean cycle length including the 128-cycle leap pattern (190 extra hours / 128). */
const RYZOV_MEAN_CYCLE_MS =
  (RYZOV_DATES_PER_CYCLE - 1) * 24 * MS_PER_HOUR + (24 + 190 / 128) * MS_PER_HOUR

/** Cumulative ms from the Ryzov epoch to the start of `cycleNumber`. */
export function ryzovCycleStartMs(cycleNumber: number): number {
  if (cycleNumber === 1) return 0
  if (cycleNumber > 1) {
    let total = 0
    for (let cycle = 1; cycle < cycleNumber; cycle++) total += ryzovCycleLengthMs(cycle)
    return total
  }
  let total = 0
  for (let cycle = cycleNumber; cycle <= 0; cycle++) total -= ryzovCycleLengthMs(cycle)
  return total
}

function findRyzovCycle(msInto: number): { cycle: number; intoCycle: number } {
  let guess = Math.floor(msInto / RYZOV_MEAN_CYCLE_MS) + 1
  if (guess === 0) guess = msInto < 0 ? -1 : 1

  let start = ryzovCycleStartMs(guess)
  while (start > msInto) {
    guess -= 1
    start -= ryzovCycleLengthMs(guess)
  }
  while (start + ryzovCycleLengthMs(guess) <= msInto) {
    start += ryzovCycleLengthMs(guess)
    guess += 1
  }
  return { cycle: guess, intoCycle: msInto - start }
}

export function ryzovDateLengthMs(cycleNumber: number, dateOfCycle: number): number {
  if (dateOfCycle === RYZOV_DATES_PER_CYCLE) return ryzovLeapHours(cycleNumber) * MS_PER_HOUR
  return 24 * MS_PER_HOUR
}

/** Shift a Ryzov (cycle, dateOfCycle) by a whole number of dates, wrapping cycles. */
export function shiftRyzovDate(
  cycle: number,
  dateOfCycle: number,
  deltaDates: number,
): { cycle: number; dateOfCycle: number } {
  let nextCycle = cycle
  let nextDate = dateOfCycle + deltaDates
  while (nextDate > RYZOV_DATES_PER_CYCLE) {
    nextDate -= RYZOV_DATES_PER_CYCLE
    nextCycle += 1
  }
  while (nextDate < 1) {
    nextCycle -= 1
    nextDate += RYZOV_DATES_PER_CYCLE
  }
  return { cycle: nextCycle, dateOfCycle: nextDate }
}

function ryzovPartsAtGlobal(at: Date): RyzovParts {
  const msInto = ryzovMsIntoCalendar(at)
  const { cycle, intoCycle } = findRyzovCycle(msInto)

  let remaining = intoCycle
  let dateOfCycle = 1
  while (dateOfCycle < RYZOV_DATES_PER_CYCLE) {
    const length = ryzovDateLengthMs(cycle, dateOfCycle)
    if (remaining < length) {
      const week = Math.floor((dateOfCycle - 1) / RYZOV_DATES_PER_WEEK) + 1
      const date = ((dateOfCycle - 1) % RYZOV_DATES_PER_WEEK) + 1
      return {
        cycle,
        week,
        date,
        dateOfCycle,
        timeOfDate: remaining / length,
        dateLengthMs: length,
      }
    }
    remaining -= length
    dateOfCycle += 1
  }

  const length = ryzovDateLengthMs(cycle, RYZOV_DATES_PER_CYCLE)
  const week = RYZOV_WEEKS_PER_CYCLE
  const date = RYZOV_DATES_PER_WEEK
  return {
    cycle,
    week,
    date,
    dateOfCycle: RYZOV_DATES_PER_CYCLE,
    timeOfDate: remaining / length,
    dateLengthMs: length,
  }
}

export function ryzovParts(at: Date, siteId?: string): RyzovParts {
  const global = ryzovPartsAtGlobal(at)
  const zone = ryzovWeekZone(siteId)
  if (zone === 0) return global

  const shifted = shiftRyzovDate(global.cycle, global.dateOfCycle, zone * RYZOV_DATES_PER_WEEK)
  const week = Math.floor((shifted.dateOfCycle - 1) / RYZOV_DATES_PER_WEEK) + 1
  const date = ((shifted.dateOfCycle - 1) % RYZOV_DATES_PER_WEEK) + 1
  return {
    cycle: shifted.cycle,
    week,
    date,
    dateOfCycle: shifted.dateOfCycle,
    // Time stays on the global date; only the reported calendar date shifts.
    timeOfDate: global.timeOfDate,
    dateLengthMs: global.dateLengthMs,
  }
}

export function dateFromRyzov(cycle: number, dateOfCycle: number, timeOfDate: number): Date {
  let ms = RYZOV_EPOCH_MS + ryzovCycleStartMs(cycle)
  for (let date = 1; date < dateOfCycle; date++) ms += ryzovDateLengthMs(cycle, date)
  ms += wrapUnit(timeOfDate) * ryzovDateLengthMs(cycle, dateOfCycle)
  return new Date(ms)
}

/** Convert a site-local Ryzov date back to UTC. */
export function dateFromLocalRyzov(
  cycle: number,
  dateOfCycle: number,
  timeOfDate: number,
  siteId?: string,
): Date {
  const global = shiftRyzovDate(cycle, dateOfCycle, -ryzovWeekZone(siteId) * RYZOV_DATES_PER_WEEK)
  return dateFromRyzov(global.cycle, global.dateOfCycle, timeOfDate)
}

export function formatSexagesimal(fraction: number, hoursOnDial: number): string {
  const total = wrapUnit(fraction) * hoursOnDial
  const hour = Math.floor(total)
  const minute = Math.floor((total - hour) * 60)
  const second = Math.floor(((total - hour) * 60 - minute) * 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

export function formatMetric(fraction: number): string {
  const total = wrapUnit(fraction) * 10
  const hour = Math.floor(total)
  const minute = Math.floor((total - hour) * 100)
  const second = Math.floor(((total - hour) * 100 - minute) * 100)
  return `${hour}h ${String(minute).padStart(2, '0')}m ${String(second).padStart(2, '0')}s`
}

export function formatPhaseClock(fraction: number): string {
  const total = wrapUnit(fraction) * 6
  const hour = Math.floor(total)
  const minute = Math.floor((total - hour) * 60)
  const second = Math.floor(((total - hour) * 60 - minute) * 60)
  return `${hour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}
