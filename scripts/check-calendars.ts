import assert from 'node:assert/strict'
import { calendarDrivers, type CalendarDriver } from '../src/lib/calendars.ts'

function driver(id: string): CalendarDriver {
  const result = calendarDrivers.find((candidate) => candidate.id === id)
  assert.ok(result, `Missing ${id} calendar driver`)
  return result
}

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 34, 56, 789)
}

function assertSelectedCellRoundTrip(calendar: CalendarDriver, at: Date): void {
  const selected = calendar.dateParts(at)
  const grid = calendar.monthGrid(at)
  assert.ok(grid)
  const cell = grid.cells.find((candidate) => candidate.key === selected.key)
  assert.ok(cell, `${calendar.name} grid does not contain its selected date`)
  assert.equal(calendar.dateParts(cell.instant).key, selected.key)
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

console.log('Calendar checks passed')
