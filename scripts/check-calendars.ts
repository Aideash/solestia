import assert from 'node:assert/strict'
import { calendarDrivers, type CalendarDriver } from '../src/lib/calendars.ts'
import {
  clancyCalendar,
  darianCalendar,
  darianMonthLength,
  isDarianLeap,
} from '../src/lib/marsCalendars.ts'
import { clancyMarsYear, dateFromMsd, marsSolDate, solarLongitude } from '../src/lib/marsTime.ts'

function driver(id: string): CalendarDriver {
  const result = calendarDrivers.find((candidate) => candidate.id === id)
  assert.ok(result, `Missing ${id} calendar driver`)
  return result
}

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 34, 56, 789)
}

function assertSelectedCellRoundTrip(calendar: CalendarDriver, at: Date, timeZone?: string): void {
  const selected = calendar.dateParts(at, timeZone)
  const grid = calendar.monthGrid(at, undefined, timeZone)
  assert.ok(grid)
  const cell = grid.cells.find((candidate) => candidate.key === selected.key)
  assert.ok(cell, `${calendar.name} grid does not contain its selected date`)
  assert.equal(calendar.dateParts(cell.instant, timeZone).key, selected.key)
}

const french = driver('french-republican')
const metric = driver('metric')

assert.deepEqual(french.dateParts(localDate(1792, 9, 22)), {
  year: 1,
  month: 1,
  monthCode: 'M01',
  day: 1,
  complementary: false,
  key: 'french-republican-1-M01-1',
})

const frenchLeapDay = localDate(1795, 9, 22)
assert.equal(french.label(frenchLeapDay), 'Fête de la Révolution, An 3')
const frenchComplementaryGrid = french.monthGrid(frenchLeapDay)
assert.ok(frenchComplementaryGrid)
assert.equal(frenchComplementaryGrid.columnCount, 6)
assert.equal(frenchComplementaryGrid.weekdayLabels.length, 0)
assert.equal(frenchComplementaryGrid.cells.at(-1)?.title, 'Fête de la Révolution')

const frenchNewYear = french.dateParts(localDate(1795, 9, 23))
assert.equal(frenchNewYear.year, 4)
assert.equal(frenchNewYear.month, 1)
assert.equal(frenchNewYear.day, 1)

const frenchOrdinaryGrid = french.monthGrid(localDate(2026, 3, 20))
assert.ok(frenchOrdinaryGrid)
assert.equal(frenchOrdinaryGrid.columnCount, 10)
assert.deepEqual(frenchOrdinaryGrid.weekdayLabels[0], { short: 'pr', long: 'Primidi' })

const metricTurning = metric.dateParts(localDate(2026, 3, 20))
assert.equal(metricTurning.key, 'metric-56-turning-1')
assert.equal(metric.label(localDate(2026, 3, 23)), 'Primday, Unil 1, Year 56')

const metricMonthGrid = metric.monthGrid(localDate(2026, 3, 23))
assert.ok(metricMonthGrid)
assert.equal(metricMonthGrid.columnCount, 10)
assert.deepEqual(metricMonthGrid.weekdayLabels[0], { short: 'pr', long: 'Primday' })

const metricYuleGrid = metric.monthGrid(localDate(2026, 12, 18))
assert.ok(metricYuleGrid)
assert.equal(metricYuleGrid.headingPrimary, 'Yule · Year 56')
assert.equal(metricYuleGrid.cells.length, 2)
assert.equal(metricYuleGrid.columnCount, 2)
assert.equal(metricYuleGrid.cells[0]?.label, 'Yule Eve')

for (const calendar of [french, metric]) {
  for (const at of [
    localDate(1800, 1, 1),
    localDate(2026, 3, 20),
    localDate(2026, 9, 22),
    localDate(2050, 12, 31),
  ]) {
    assertSelectedCellRoundTrip(calendar, at)

    for (const shifted of [calendar.shiftMonth(at, -1), calendar.shiftMonth(at, 1)]) {
      assert.equal(shifted.getHours(), at.getHours())
      assert.equal(shifted.getMinutes(), at.getMinutes())
      assert.equal(shifted.getSeconds(), at.getSeconds())
      assert.equal(shifted.getMilliseconds(), at.getMilliseconds())
      assertSelectedCellRoundTrip(calendar, shifted)
    }
  }
}

const chinese = driver('chinese')
const chineseAt = localDate(2026, 7, 21)
const chineseEnglish = chinese.monthGrid(chineseAt, 'en')
assert.ok(chineseEnglish)
assert.equal(chineseEnglish.headingPrimary, 'Sixth Month')
assert.equal(chineseEnglish.headingSecondary, '2026 (bing-wu)')
assert.equal(chineseEnglish.headingTitle, 'Fire (Yang) — Heavenly Stem\nHorse — Earthly Branch')
assert.equal(chineseEnglish.weekdayLabels[0]?.short, 'Sun')

const chineseNative = chinese.monthGrid(chineseAt, 'zh')
assert.ok(chineseNative)
assert.equal(chineseNative.headingPrimary, '2026丙午年六月')
assert.equal(chineseNative.headingSecondary, undefined)
assert.equal(chineseNative.headingTitle, 'Fire (Yang) — Heavenly Stem\nHorse — Earthly Branch')
assert.equal(chineseNative.weekdayLabels[0]?.short, '周日')

assertSelectedCellRoundTrip(chinese, chineseAt)

const gregory = driver('gregory')
const lateUtc = new Date(Date.UTC(2026, 2, 20, 23, 0, 0))
assert.equal(gregory.dateParts(lateUtc, 'UTC').day, 20)
assert.equal(gregory.dateParts(lateUtc, 'America/New_York').day, 20)
assert.equal(gregory.dateParts(lateUtc, 'Pacific/Auckland').day, 21)
assertSelectedCellRoundTrip(gregory, lateUtc, 'Pacific/Auckland')
assertSelectedCellRoundTrip(gregory, lateUtc, 'America/New_York')
assertSelectedCellRoundTrip(french, lateUtc, 'Pacific/Auckland')
assertSelectedCellRoundTrip(metric, lateUtc, 'Pacific/Auckland')

const aucklandShift = gregory.shiftMonth(lateUtc, 1, 'Pacific/Auckland')
assert.equal(gregory.dateParts(aucklandShift, 'Pacific/Auckland').month, 4)
assert.equal(gregory.dateParts(aucklandShift, 'Pacific/Auckland').day, 21)

function wrapSolFraction(msd: number): number {
  return ((msd % 1) + 1) % 1
}

assert.equal(isDarianLeap(1), true)
assert.equal(isDarianLeap(2), false)
assert.equal(isDarianLeap(10), true)
assert.equal(isDarianLeap(100), false)
assert.equal(darianMonthLength(1, 24), 28)
assert.equal(darianMonthLength(2, 24), 27)

const allisonEpoch = dateFromMsd(0)
const virgo = darianCalendar.dateParts(allisonEpoch, 'airy')
assert.equal(virgo.year, 140)
assert.equal(virgo.month, 19)
assert.equal(virgo.day, 25)
assert.equal(darianCalendar.label(allisonEpoch, undefined, 'airy'), 'Sol Mercurii, 25 Virgo 140')

const jan6 = new Date(Date.UTC(2000, 0, 6, 0, 0, 0))
assert.ok(Math.abs(marsSolDate(jan6) - 44796) < 0.002)

assertSelectedCellRoundTrip(darianCalendar, jan6, 'airy')
assertSelectedCellRoundTrip(darianCalendar, jan6, 'curiosity')
assertSelectedCellRoundTrip(clancyCalendar, jan6, 'airy')

const jan6Darian = darianCalendar.dateParts(jan6, 'airy')
const darianShift = darianCalendar.shiftMonth(jan6, 1, 'airy')
assert.equal(
  darianCalendar.dateParts(darianShift, 'airy').month,
  jan6Darian.month === 24 ? 1 : jan6Darian.month + 1,
)
assert.ok(
  Math.abs(wrapSolFraction(marsSolDate(darianShift)) - wrapSolFraction(marsSolDate(jan6))) < 1e-6,
)

const my1 = new Date(Date.UTC(1955, 3, 11, 12, 0, 0))
assert.equal(clancyMarsYear(my1), 1)
assert.ok(solarLongitude(my1) < 2 || solarLongitude(my1) > 358)

const curiosity = new Date(Date.UTC(2012, 7, 6, 5, 17, 57))
assertSelectedCellRoundTrip(darianCalendar, curiosity, 'curiosity')
assertSelectedCellRoundTrip(clancyCalendar, curiosity, 'curiosity')
assert.ok(clancyMarsYear(curiosity) >= 31 && clancyMarsYear(curiosity) <= 32)

for (const calendar of [darianCalendar, clancyCalendar]) {
  for (const at of [jan6, curiosity, new Date(Date.UTC(2026, 2, 20, 12, 0, 0))]) {
    for (const shifted of [
      calendar.shiftMonth(at, -1, 'airy'),
      calendar.shiftMonth(at, 1, 'airy'),
    ]) {
      assert.ok(
        Math.abs(wrapSolFraction(marsSolDate(shifted)) - wrapSolFraction(marsSolDate(at))) < 1e-4,
      )
      assertSelectedCellRoundTrip(calendar, shifted, 'airy')
    }
  }
}

console.log('Calendar checks passed')
