import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from '../data/planets.ts'
import type { CalendarCell, CalendarDriver } from './calendars.ts'
import type { ClockDriver, ClockHands, ClockNumeral } from './clocks.ts'
import {
  CYCLES_PER_PHASE,
  CYCLES_PER_SOL,
  dateFromLocalCycleIndex,
  dateFromLocalRyzov,
  formatMetric,
  formatPhaseClock,
  formatSexagesimal,
  localMeanSolFraction,
  meanYearFraction,
  MS_PER_CYCLE,
  MS_PER_MERCURY_SOL,
  MS_PER_MERCURY_YEAR,
  PHASE_NAMES,
  PHASE_WEEKDAYS,
  phaseParts,
  RYZOV_DATES_PER_CYCLE,
  RYZOV_DATES_PER_WEEK,
  RYZOV_WEEKDAYS,
  RYZOV_WEEKS,
  ryzovParts,
  wrapUnit,
} from './mercuryTime.ts'

export type MercuryCadenceSource = 'day' | 'year'
export type MercurySystemLayout = 'calendar' | 'dual'

export type MercurySystem = {
  id: string
  name: string
  layout: MercurySystemLayout
  calendar?: CalendarDriver
  dayClock: ClockDriver
  yearClock?: ClockDriver
  defaultCadence: MercuryCadenceSource
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

function sexagesimalHands(fraction: number, hoursOnDial: number): ClockHands {
  const total = wrapUnit(fraction) * hoursOnDial
  const minutePart = (total % 1) * 60
  const secondPart = (minutePart % 1) * 60
  return {
    major: (total % hoursOnDial) / hoursOnDial,
    middle: minutePart / 60,
    minor: secondPart / 60,
  }
}

function metricHands(fraction: number): ClockHands {
  const hours = wrapUnit(fraction) * 10
  const minutes = (hours % 1) * 100
  const seconds = (minutes % 1) * 100
  return {
    major: hours / 10,
    middle: minutes / 100,
    minor: seconds / 100,
  }
}

function inWindow(startMs: number, endMs: number): boolean {
  return endMs >= ELEMENTS_VALID_FROM_MS && startMs <= ELEMENTS_VALID_TO_MS
}

const MS_PER_CYCLE_HOUR = MS_PER_CYCLE / 6
const MS_PER_CYCLE_MINUTE = MS_PER_CYCLE / (6 * 60)
const MS_PER_CYCLE_SECOND = MS_PER_CYCLE / (6 * 60 * 60)

/** Cycle clock stays global — site only shifts the calendar date. */
const phaseCycleClock: ClockDriver = {
  id: 'mercury-phase-cycle',
  name: 'Cycle 6-60-60',
  dial: { majorTicks: 6, minorTicks: 60, numeralEvery: 1 },
  periods: { major: MS_PER_CYCLE, middle: MS_PER_CYCLE_HOUR, minor: MS_PER_CYCLE_MINUTE },
  tickMs: MS_PER_CYCLE_SECOND,
  frameMs(at) {
    return phaseParts(at).timeOfCycle * MS_PER_CYCLE
  },
  numerals() {
    return numberedNumerals(6, 1, (index) => String(index))
  },
  hands(at) {
    return sexagesimalHands(phaseParts(at).timeOfCycle, 6)
  },
  label(at) {
    return `${formatPhaseClock(phaseParts(at).timeOfCycle)} cycle`
  },
}

function makePhasesCalendar(): CalendarDriver {
  return {
    id: 'mercury-phases',
    name: 'Phases',
    dateParts(instant, siteId) {
      const parts = phaseParts(instant, siteId)
      const month = parts.phase + 1
      const monthCode = `P${String(month).padStart(2, '0')}`
      return {
        year: parts.solIndex,
        month,
        monthCode,
        day: parts.cycle,
        key: `mercury-phases-${parts.solIndex}-${monthCode}-${parts.cycle}`,
      }
    },
    monthGrid(instant, _locale, siteId) {
      const parts = phaseParts(instant, siteId)
      const phase = PHASE_NAMES[parts.phase]
      const phaseStartCycle = parts.solIndex * CYCLES_PER_SOL + parts.phase * CYCLES_PER_PHASE
      const cells: CalendarCell[] = Array.from({ length: CYCLES_PER_PHASE }, (_, offset) => {
        const cycle = offset + 1
        const cycleIndex = phaseStartCycle + offset
        const weekday = PHASE_WEEKDAYS[((cycleIndex % 6) + 6) % 6]
        const start = dateFromLocalCycleIndex(cycleIndex, 0, siteId)
        const end = dateFromLocalCycleIndex(cycleIndex + 1, 0, siteId)
        return {
          day: cycle,
          key: `mercury-phases-${parts.solIndex}-P${String(parts.phase + 1).padStart(2, '0')}-${cycle}`,
          instant: dateFromLocalCycleIndex(cycleIndex, parts.timeOfCycle, siteId),
          inMonth: true,
          inWindow: inWindow(start.getTime(), end.getTime() - 1),
          title: weekday ? `${weekday.long}, cycle ${cycle} of ${phase?.long}` : undefined,
        }
      })
      return {
        headingPrimary: `${phase?.short ?? 'Phase'} · Sol ${parts.solIndex}`,
        headingSecondary: phase?.long,
        headingTitle: `${phase?.long}: phase ${parts.phase + 1} of 6 in civil solar day ${parts.solIndex}`,
        columnCount: 6,
        weekdayLabels: PHASE_WEEKDAYS,
        cells,
      }
    },
    label(instant, _locale, siteId) {
      const parts = phaseParts(instant, siteId)
      const phase = PHASE_NAMES[parts.phase]
      const weekday = PHASE_WEEKDAYS[parts.weekday]
      return `${weekday?.long}, ${phase?.short} ${parts.cycle}, Sol ${parts.solIndex}`
    },
    shiftMonth(instant, delta, siteId) {
      const parts = phaseParts(instant, siteId)
      const cycleIndex = parts.cycleIndex + delta * CYCLES_PER_PHASE
      return dateFromLocalCycleIndex(cycleIndex, parts.timeOfCycle, siteId)
    },
    shiftYear(instant, delta, siteId) {
      const parts = phaseParts(instant, siteId)
      return dateFromLocalCycleIndex(parts.cycleIndex + delta * CYCLES_PER_SOL, parts.timeOfCycle, siteId)
    },
  }
}

/** Ryzov date clock stays global — site only shifts the calendar date. */
const MS_PER_RYZOV_MINUTE = 60_000
const MS_PER_RYZOV_HOUR = 3_600_000

function ryzovHoursOnDate(at: Date): number {
  return ryzovParts(at).dateLengthMs / MS_PER_RYZOV_HOUR
}

function ryzovDialForHours(hours: number) {
  return { majorTicks: hours, minorTicks: 60, numeralEvery: 1 }
}

function ryzovPeriodsForHours(hours: number) {
  return {
    major: hours * MS_PER_RYZOV_HOUR,
    middle: MS_PER_RYZOV_HOUR,
    minor: MS_PER_RYZOV_MINUTE,
  }
}

const ryzovClock: ClockDriver = {
  id: 'mercury-ryzov-date',
  name: 'Ryzov date',
  dial: ryzovDialForHours(24),
  dialAt(at) {
    return ryzovDialForHours(ryzovHoursOnDate(at))
  },
  periods: ryzovPeriodsForHours(24),
  periodsAt(at) {
    return ryzovPeriodsForHours(ryzovHoursOnDate(at))
  },
  tickMs: 1000,
  frameMs(at) {
    const parts = ryzovParts(at)
    return parts.timeOfDate * parts.dateLengthMs
  },
  numerals() {
    return numberedNumerals(24, 1, (index) => String(index))
  },
  numeralsAt(at) {
    const hours = ryzovHoursOnDate(at)
    return numberedNumerals(hours, 1, (index) => String(index))
  },
  hands(at) {
    return sexagesimalHands(ryzovParts(at).timeOfDate, ryzovHoursOnDate(at))
  },
  label(at) {
    const parts = ryzovParts(at)
    const hours = parts.dateLengthMs / MS_PER_RYZOV_HOUR
    return `${formatSexagesimal(parts.timeOfDate, hours)} date`
  },
}

function makeRyzovCalendar(): CalendarDriver {
  return {
    id: 'mercury-ryzov',
    name: 'Ryzov',
    dateParts(instant, siteId) {
      const parts = ryzovParts(instant, siteId)
      const monthCode = `W${String(parts.week).padStart(2, '0')}`
      return {
        year: parts.cycle,
        month: parts.week,
        monthCode,
        day: parts.date,
        key: `mercury-ryzov-${parts.cycle}-${monthCode}-${parts.date}`,
      }
    },
    monthGrid(instant, _locale, siteId) {
      const parts = ryzovParts(instant, siteId)
      const week = RYZOV_WEEKS[parts.week - 1]
      const weekStartDate = (parts.week - 1) * RYZOV_DATES_PER_WEEK + 1
      const cells: CalendarCell[] = Array.from({ length: RYZOV_DATES_PER_WEEK }, (_, offset) => {
        const date = offset + 1
        const dateOfCycle = weekStartDate + offset
        const weekday = RYZOV_WEEKDAYS[offset]
        const start = dateFromLocalRyzov(parts.cycle, dateOfCycle, 0, siteId)
        const end = dateFromLocalRyzov(parts.cycle, dateOfCycle, 1, siteId)
        return {
          day: dateOfCycle,
          key: `mercury-ryzov-${parts.cycle}-W${String(parts.week).padStart(2, '0')}-${date}`,
          instant: dateFromLocalRyzov(parts.cycle, dateOfCycle, parts.timeOfDate, siteId),
          inMonth: true,
          inWindow: inWindow(start.getTime(), end.getTime() - 1),
          title: weekday
            ? `${weekday.long}, ${week?.long} ${dateOfCycle}, Cycle ${parts.cycle}`
            : undefined,
        }
      })
      return {
        headingPrimary: `${week?.long ?? 'Week'} · Cycle ${parts.cycle}`,
        headingSecondary: week?.short,
        headingTitle: `Week ${parts.week} of 22 (${week?.long})`,
        columnCount: 8,
        weekdayLabels: RYZOV_WEEKDAYS,
        cells,
      }
    },
    label(instant, _locale, siteId) {
      const parts = ryzovParts(instant, siteId)
      const week = RYZOV_WEEKS[parts.week - 1]
      const weekday = RYZOV_WEEKDAYS[parts.date - 1]
      return `${weekday?.long}, ${week?.short} ${parts.dateOfCycle}, Cycle ${parts.cycle}`
    },
    shiftMonth(instant, delta, siteId) {
      const parts = ryzovParts(instant, siteId)
      let cycle = parts.cycle
      let dateOfCycle = parts.dateOfCycle + delta * RYZOV_DATES_PER_WEEK
      while (dateOfCycle > RYZOV_DATES_PER_CYCLE) {
        dateOfCycle -= RYZOV_DATES_PER_CYCLE
        cycle += 1
      }
      while (dateOfCycle < 1) {
        cycle -= 1
        dateOfCycle += RYZOV_DATES_PER_CYCLE
      }
      return dateFromLocalRyzov(cycle, dateOfCycle, parts.timeOfDate, siteId)
    },
    shiftYear(instant, delta, siteId) {
      const parts = ryzovParts(instant, siteId)
      return dateFromLocalRyzov(parts.cycle + delta, parts.dateOfCycle, parts.timeOfDate, siteId)
    },
  }
}

function makeDual24DayClock(): ClockDriver {
  const MS_PER_HOUR = MS_PER_MERCURY_SOL / 24
  const MS_PER_MINUTE = MS_PER_MERCURY_SOL / (24 * 60)
  const MS_PER_SECOND = MS_PER_MERCURY_SOL / (24 * 60 * 60)
  return {
    id: 'mercury-dual-24-day',
    name: 'Mean sol 24h',
    dial: { majorTicks: 24, minorTicks: 60, numeralEvery: 1 },
    periods: { major: MS_PER_MERCURY_SOL, middle: MS_PER_HOUR, minor: MS_PER_MINUTE },
    tickMs: MS_PER_SECOND,
    frameMs(at, siteId) {
      return localMeanSolFraction(at, siteId) * MS_PER_MERCURY_SOL
    },
    numerals() {
      return numberedNumerals(24, 1, (index) => String(index))
    },
    hands(at, siteId) {
      return sexagesimalHands(localMeanSolFraction(at, siteId), 24)
    },
    label(at, _locale, siteId) {
      return `${formatSexagesimal(localMeanSolFraction(at, siteId), 24)} sol`
    },
  }
}

function makeDual24YearClock(): ClockDriver {
  const MS_PER_HOUR = MS_PER_MERCURY_YEAR / 24
  const MS_PER_MINUTE = MS_PER_MERCURY_YEAR / (24 * 60)
  const MS_PER_SECOND = MS_PER_MERCURY_YEAR / (24 * 60 * 60)
  return {
    id: 'mercury-dual-24-year',
    name: 'Mean year 24h',
    dial: { majorTicks: 24, minorTicks: 60, numeralEvery: 1 },
    periods: { major: MS_PER_MERCURY_YEAR, middle: MS_PER_HOUR, minor: MS_PER_MINUTE },
    tickMs: MS_PER_SECOND,
    frameMs(at) {
      return meanYearFraction(at) * MS_PER_MERCURY_YEAR
    },
    numerals() {
      return numberedNumerals(24, 1, (index) => String(index))
    },
    hands(at) {
      return sexagesimalHands(meanYearFraction(at), 24)
    },
    label(at) {
      return `${formatSexagesimal(meanYearFraction(at), 24)} year`
    },
  }
}

function makeDualMetricDayClock(): ClockDriver {
  return {
    id: 'mercury-dual-metric-day',
    name: 'Mean sol metric',
    dial: { majorTicks: 10, minorTicks: 100, numeralEvery: 1 },
    periods: {
      major: MS_PER_MERCURY_SOL,
      middle: MS_PER_MERCURY_SOL / 10,
      minor: MS_PER_MERCURY_SOL / 1000,
    },
    tickMs: MS_PER_MERCURY_SOL / 100_000,
    frameMs(at, siteId) {
      return localMeanSolFraction(at, siteId) * MS_PER_MERCURY_SOL
    },
    numerals() {
      return numberedNumerals(10, 1, (index) => (index === 0 ? '10' : String(index)))
    },
    hands(at, siteId) {
      return metricHands(localMeanSolFraction(at, siteId))
    },
    label(at, _locale, siteId) {
      return `${formatMetric(localMeanSolFraction(at, siteId))} sol`
    },
  }
}

function makeDualMetricYearClock(): ClockDriver {
  return {
    id: 'mercury-dual-metric-year',
    name: 'Mean year metric',
    dial: { majorTicks: 10, minorTicks: 100, numeralEvery: 1 },
    periods: {
      major: MS_PER_MERCURY_YEAR,
      middle: MS_PER_MERCURY_YEAR / 10,
      minor: MS_PER_MERCURY_YEAR / 1000,
    },
    tickMs: MS_PER_MERCURY_YEAR / 100_000,
    frameMs(at) {
      return meanYearFraction(at) * MS_PER_MERCURY_YEAR
    },
    numerals() {
      return numberedNumerals(10, 1, (index) => (index === 0 ? '10' : String(index)))
    },
    hands(at) {
      return metricHands(meanYearFraction(at))
    },
    label(at) {
      return `${formatMetric(meanYearFraction(at))} year`
    },
  }
}

export const mercurySystems: readonly MercurySystem[] = [
  {
    id: 'phases',
    name: 'Phases',
    layout: 'calendar',
    calendar: makePhasesCalendar(),
    dayClock: phaseCycleClock,
    defaultCadence: 'day',
  },
  {
    id: 'ryzov',
    name: 'Ryzov Mercurian',
    layout: 'calendar',
    calendar: makeRyzovCalendar(),
    dayClock: ryzovClock,
    defaultCadence: 'day',
  },
  {
    id: 'dual-24',
    name: 'Dual 24-hour',
    layout: 'dual',
    dayClock: makeDual24DayClock(),
    yearClock: makeDual24YearClock(),
    defaultCadence: 'day',
  },
  {
    id: 'dual-metric',
    name: 'Dual metric',
    layout: 'dual',
    dayClock: makeDualMetricDayClock(),
    yearClock: makeDualMetricYearClock(),
    defaultCadence: 'day',
  },
] as const

export function mercurySystem(id: string): MercurySystem {
  return mercurySystems.find((system) => system.id === id) ?? mercurySystems[0]!
}
