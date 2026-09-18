import assert from 'node:assert/strict'
import { mercurySystem, mercurySystems } from '../src/lib/mercurySystems.ts'
import {
  CYCLES_PER_PHASE,
  CYCLES_PER_SOL,
  CYCLES_PER_YEAR,
  dateFromCycleIndex,
  dateFromLocalRyzov,
  dateFromRyzov,
  localMeanSolFraction,
  meanSolFraction,
  meanYearFraction,
  MS_PER_CYCLE,
  MS_PER_MERCURY_SOL,
  MS_PER_MERCURY_YEAR,
  PHASE_EPOCH_MS,
  phaseParts,
  phaseZone,
  phaseZoneForLongitude,
  RYZOV_DATES_PER_CYCLE,
  RYZOV_EPOCH_MS,
  ryzovLeapHours,
  ryzovParts,
  ryzovWeekZone,
  ryzovWeekZoneForLongitude,
} from '../src/lib/mercuryTime.ts'
import { dialOf, numeralsOf, periodsOf, type ClockDriver } from '../src/lib/clocks.ts'

function assertTick(clock: ClockDriver): void {
  assert.ok(clock.tickMs > 0, `${clock.id}: tick must be positive`)
  const revolution = clock.periods.minor
  if (revolution === null) return
  const ticks = revolution / clock.tickMs
  assert.ok(ticks >= 1, `${clock.id}: tick is longer than one turn of the second hand`)
  assert.ok(
    Math.abs(ticks - Math.round(ticks)) < 1e-9,
    `${clock.id}: ${ticks} ticks per turn of the second hand is not a whole number`,
  )
}

// Year-locked packing: no leap cycles.
assert.equal(CYCLES_PER_YEAR, 90)
assert.equal(CYCLES_PER_SOL, 180)
assert.equal(CYCLES_PER_PHASE, 30)
assert.ok(Math.abs(MS_PER_MERCURY_SOL - 2 * MS_PER_MERCURY_YEAR) < 1e-6)
assert.ok(Math.abs(MS_PER_CYCLE * CYCLES_PER_YEAR - MS_PER_MERCURY_YEAR) < 1e-3)

const epoch = new Date(PHASE_EPOCH_MS)
const atEpoch = phaseParts(epoch)
assert.equal(atEpoch.solIndex, 0)
assert.equal(atEpoch.phase, 0)
assert.equal(atEpoch.cycle, 1)
assert.equal(atEpoch.weekday, 0)
assert.ok(atEpoch.timeOfCycle < 1e-9)

const oneYearLater = new Date(PHASE_EPOCH_MS + MS_PER_MERCURY_YEAR)
assert.ok(
  Math.abs(meanYearFraction(oneYearLater)) < 1e-6 ||
    Math.abs(meanYearFraction(oneYearLater) - 1) < 1e-6,
)
assert.ok(Math.abs(meanSolFraction(oneYearLater) - 0.5) < 1e-6)

const halfSol = dateFromCycleIndex(CYCLES_PER_SOL / 2, 0)
const midSol = phaseParts(halfSol)
assert.equal(midSol.phase, 3)
assert.equal(midSol.cycle, 1)
assert.equal(midSol.solIndex, 0)

const roundTrip = dateFromCycleIndex(1234, 0.25)
const roundParts = phaseParts(roundTrip)
assert.equal(roundParts.cycleIndex, 1234)
assert.ok(Math.abs(roundParts.timeOfCycle - 0.25) < 1e-6)

// Ryzov leap hours.
assert.equal(ryzovLeapHours(1), 25)
assert.equal(ryzovLeapHours(2), 26)
assert.equal(ryzovLeapHours(128), 24)
assert.equal(ryzovLeapHours(129), 25)

const ryzovEpoch = new Date(RYZOV_EPOCH_MS)
const ryzovAtEpoch = ryzovParts(ryzovEpoch)
assert.equal(ryzovAtEpoch.cycle, 1)
assert.equal(ryzovAtEpoch.week, 1)
assert.equal(ryzovAtEpoch.date, 1)
assert.equal(ryzovAtEpoch.dateOfCycle, 1)
assert.ok(ryzovAtEpoch.timeOfDate < 1e-9)

const ryzovSample = dateFromRyzov(3, RYZOV_DATES_PER_CYCLE, 0.5)
const ryzovSampleParts = ryzovParts(ryzovSample)
assert.equal(ryzovSampleParts.cycle, 3)
assert.equal(ryzovSampleParts.dateOfCycle, RYZOV_DATES_PER_CYCLE)
assert.equal(ryzovSampleParts.dateLengthMs, 25 * 3_600_000)
assert.ok(Math.abs(ryzovSampleParts.timeOfDate - 0.5) < 1e-9)

// Local site zones.
assert.equal(phaseZone('iau-pm'), 0)
assert.equal(ryzovWeekZone('iau-pm'), 0)
assert.equal(phaseZoneForLongitude(180), 3)
assert.equal(ryzovWeekZoneForLongitude(180), 11)
assert.equal(phaseZone('hun-kal'), 5)
assert.equal(ryzovWeekZone('hun-kal'), 20)

const primeEpoch = phaseParts(epoch, 'iau-pm')
assert.equal(primeEpoch.phase, atEpoch.phase)
assert.equal(primeEpoch.cycleIndex, atEpoch.cycleIndex)

const hunKalEpoch = phaseParts(epoch, 'hun-kal')
assert.equal(hunKalEpoch.phase, (atEpoch.phase + 5) % 6)
assert.equal(hunKalEpoch.cycleIndex, atEpoch.cycleIndex + 5 * CYCLES_PER_PHASE)
assert.ok(Math.abs(hunKalEpoch.timeOfCycle - atEpoch.timeOfCycle) < 1e-12)

const ryzovPrime = ryzovParts(ryzovEpoch, 'iau-pm')
assert.equal(ryzovPrime.week, 1)
assert.equal(ryzovPrime.dateOfCycle, 1)

const ryzovHunKal = ryzovParts(ryzovEpoch, 'hun-kal')
assert.equal(ryzovHunKal.week, 21)
assert.equal(ryzovHunKal.dateOfCycle, 1 + 20 * 8)
assert.ok(Math.abs(ryzovHunKal.timeOfDate - ryzovPrime.timeOfDate) < 1e-12)

const ryzovRound = dateFromLocalRyzov(
  ryzovHunKal.cycle,
  ryzovHunKal.dateOfCycle,
  ryzovHunKal.timeOfDate,
  'hun-kal',
)
assert.ok(Math.abs(ryzovRound.getTime() - ryzovEpoch.getTime()) < 1)

// Dual local sol: midnight at epoch on prime; noon at +180°.
assert.ok(Math.abs(localMeanSolFraction(epoch, 'iau-pm')) < 1e-9)
assert.ok(Math.abs(localMeanSolFraction(epoch, 'iau-pm') - meanSolFraction(epoch)) < 1e-12)
assert.ok(Math.abs(meanYearFraction(epoch)) < 1e-9)
assert.ok(Math.abs(((meanSolFraction(epoch) + 180 / 360) % 1) - 0.5) < 1e-12)
assert.ok(Math.abs(localMeanSolFraction(epoch, 'hun-kal') - 340 / 360) < 1e-9)

// Systems and clocks.
assert.equal(mercurySystems[0]?.id, 'phases')
const phases = mercurySystem('phases')
assert.equal(phases.layout, 'calendar')
assert.ok(phases.calendar)
assertTick(phases.dayClock)

const dual24 = mercurySystem('dual-24')
assert.equal(dual24.layout, 'dual')
assert.ok(dual24.yearClock)
assertTick(dual24.dayClock)
assertTick(dual24.yearClock!)

const dualMetric = mercurySystem('dual-metric')
assertTick(dualMetric.dayClock)
assertTick(dualMetric.yearClock!)

const ryzov = mercurySystem('ryzov')
assert.ok(ryzov.calendar)
assertTick(ryzov.dayClock)

// Leap-date face stretches to 25/26 hours; ordinary dates stay 24.
const ryzovClock = ryzov.dayClock
const ordinaryDate = dateFromRyzov(1, 1, 0.5)
assert.equal(dialOf(ryzovClock, ordinaryDate).majorTicks, 24)
assert.equal(periodsOf(ryzovClock, ordinaryDate).major, 24 * 3_600_000)
assert.equal(numeralsOf(ryzovClock, ordinaryDate).length, 24)
assert.ok(Math.abs(ryzovClock.hands(ordinaryDate).major - 0.5) < 1e-9)
assert.match(ryzovClock.label(ordinaryDate), /^12:00:00/)

const leap25 = dateFromRyzov(1, RYZOV_DATES_PER_CYCLE, 0.5)
assert.equal(dialOf(ryzovClock, leap25).majorTicks, 25)
assert.equal(periodsOf(ryzovClock, leap25).major, 25 * 3_600_000)
assert.equal(numeralsOf(ryzovClock, leap25).length, 25)
assert.ok(Math.abs(ryzovClock.hands(leap25).major - 0.5) < 1e-9)
assert.match(ryzovClock.label(leap25), /^12:30:00/)

const leap26 = dateFromRyzov(2, RYZOV_DATES_PER_CYCLE, 0.5)
assert.equal(dialOf(ryzovClock, leap26).majorTicks, 26)
assert.equal(periodsOf(ryzovClock, leap26).major, 26 * 3_600_000)
assert.equal(numeralsOf(ryzovClock, leap26).length, 26)
assert.match(ryzovClock.label(leap26), /^13:00:00/)

const leapSkip = dateFromRyzov(128, RYZOV_DATES_PER_CYCLE, 0.5)
assert.equal(dialOf(ryzovClock, leapSkip).majorTicks, 24)
assert.match(ryzovClock.label(leapSkip), /^12:00:00/)

const now = new Date(Date.UTC(2026, 0, 1))
const phaseGrid = phases.calendar!.monthGrid(now)
assert.ok(phaseGrid)
assert.equal(phaseGrid.columnCount, 6)
assert.equal(phaseGrid.cells.length, 30)

const selected = phases.calendar!.dateParts(now)
const cell = phaseGrid.cells.find((candidate) => candidate.key === selected.key)
assert.ok(cell, 'phases grid missing selected cell')
assert.equal(phases.calendar!.dateParts(cell.instant).key, selected.key)

const hunKalSelected = phases.calendar!.dateParts(now, 'hun-kal')
const hunKalGrid = phases.calendar!.monthGrid(now, undefined, 'hun-kal')
assert.ok(hunKalGrid)
const hunKalCell = hunKalGrid.cells.find((candidate) => candidate.key === hunKalSelected.key)
assert.ok(hunKalCell, 'phases local grid missing selected cell')
assert.equal(phases.calendar!.dateParts(hunKalCell.instant, 'hun-kal').key, hunKalSelected.key)

const ryzovGrid = ryzov.calendar!.monthGrid(now)
assert.ok(ryzovGrid)
assert.equal(ryzovGrid.columnCount, 8)
assert.equal(ryzovGrid.cells.length, 8)

assert.ok(dual24.dayClock.periods.major === MS_PER_MERCURY_SOL)
assert.ok(dual24.yearClock!.periods.major === MS_PER_MERCURY_YEAR)
assert.ok(dualMetric.dayClock.tickMs === MS_PER_MERCURY_SOL / 100_000)
assert.ok(dualMetric.yearClock!.tickMs === MS_PER_MERCURY_YEAR / 100_000)

assert.ok(Math.abs(dual24.yearClock!.hands(epoch).major) < 1e-9)
assert.ok(Math.abs(dual24.yearClock!.hands(epoch, 'hun-kal').major) < 1e-9)
assert.ok(Math.abs(dual24.dayClock.hands(epoch, 'iau-pm').major) < 1e-9)
assert.ok(Math.abs(dual24.dayClock.hands(epoch, 'hun-kal').major - 340 / 360) < 1e-9)

console.log('check-mercury-time: ok')
