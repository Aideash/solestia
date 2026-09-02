import assert from 'node:assert/strict'
import { clockDrivers, withHandAt, type ClockDriver, type ClockHand } from '../src/lib/clocks.ts'
import { marsClockDrivers } from '../src/lib/marsClocks.ts'
import { lmstFraction, marsSolDate } from '../src/lib/marsTime.ts'

function driver(id: string): ClockDriver {
  const result = clockDrivers.find((candidate) => candidate.id === id)
  assert.ok(result, `Missing ${id} clock driver`)
  return result
}

function fraction(value: number): number {
  return value - Math.floor(value)
}

/** Compares two positions on a dial, where 0.999 and 0.001 nearly coincide. */
function closeTurn(actual: number, expected: number, tolerance: number, what: string): void {
  const apart = Math.abs(fraction(actual - expected + 0.5) - 0.5)
  assert.ok(apart < tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`)
}

function localTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, second, 0)
}

const metric = driver('metric')
const indian = driver('indian')
const chinese = driver('chinese-shi')
const swatch = driver('swatch')
const civil12 = driver('civil-12')
const civil24 = driver('civil-24')

const midnight = localTime(2026, 3, 20, 0)
const noon = localTime(2026, 3, 20, 12)
const ziStart = localTime(2026, 3, 20, 23)

assert.equal(metric.label(midnight), '0h 00m 00s')
assert.equal(metric.label(noon), '5h 00m 00s')
assert.equal(metric.hands(midnight).major, 0)
assert.equal(metric.hands(noon).major, 0.5)

assert.equal(indian.label(midnight), 'muhurta 0, kala 0, kastha 0')
assert.equal(indian.hands(midnight).major, 0)
assert.match(indian.label(localTime(2026, 3, 20, 0, 48)), /^muhurta 1, kala 0/)

assert.equal(chinese.label(ziStart, 'zh'), '子, ke 0, fen 0')
assert.equal(chinese.label(ziStart), 'Zi, ke 0, fen 0')
assert.equal(chinese.hands(ziStart).major, 0)
assert.equal(chinese.label(midnight), 'Zi, ke 4, fen 0')
assert.equal(chinese.numerals('zh')[0]?.text, '子')
assert.equal(chinese.numerals()[0]?.text, 'Zi')

const bielNoon = new Date(Date.UTC(2026, 2, 20, 11, 0, 0))
assert.equal(swatch.label(bielNoon), '@500.0')
assert.equal(swatch.hands(bielNoon).major, 0.5)

const bielMidnight = new Date(Date.UTC(2026, 2, 20, 23, 0, 0))
assert.equal(swatch.label(bielMidnight), '@000.0')
assert.equal(swatch.hands(bielMidnight).major, 0)

assert.match(civil12.label(noon), /12/)
assert.equal(civil12.hands(noon).major, 0)
assert.equal(civil24.hands(midnight).major, 0)
assert.equal(civil24.hands(noon).major, 0.5)

assert.deepEqual(
  clockDrivers.map((item) => item.id),
  ['civil-12', 'civil-24', 'metric', 'indian', 'chinese-shi', 'swatch'],
)

const utcNoon = new Date(Date.UTC(2026, 2, 20, 12, 0, 0))
assert.equal(civil24.hands(utcNoon, 'UTC').major, 0.5)
assert.equal(metric.label(utcNoon, undefined, 'UTC'), '5h 00m 00s')
assert.equal(civil24.hands(utcNoon, 'Pacific/Auckland').major, 1 / 24)
assert.equal(metric.label(utcNoon, undefined, 'Pacific/Auckland'), '0h 41m 66s')
assert.equal(swatch.label(bielNoon, undefined, 'Pacific/Auckland'), '@500.0')
assert.equal(swatch.hands(bielNoon, 'America/New_York').major, 0.5)

const sample = localTime(2026, 3, 20, 15, 30, 45)
const handNames: ClockHand[] = ['major', 'middle', 'minor']

for (const clock of clockDrivers) {
  const hands = clock.hands(sample)
  assert.ok(hands.major >= 0 && hands.major < 1)
  assert.ok(hands.middle >= 0 && hands.middle < 1)
  if (hands.minor !== null) {
    assert.ok(hands.minor >= 0 && hands.minor < 1)
  }
  assert.ok(clock.label(noon).length > 0)
  assert.ok(clock.numerals().length > 0)

  // Dragging inverts `hands` using `periods` and `frameMs`, so the three have
  // to describe the same movement. UTC keeps the arithmetic free of the DST
  // shifts the host zone might carry.
  const frame = clock.frameMs(sample, 'UTC')
  const utcHands = clock.hands(sample, 'UTC')
  for (const hand of handNames) {
    const period = clock.periods[hand]
    const position = utcHands[hand]
    if (period === null || position === null) {
      assert.equal(period === null, position === null, `${clock.id} ${hand}: period vs hand`)
      continue
    }
    closeTurn(position, fraction(frame / period), 1e-9, `${clock.id} ${hand} period`)

    for (const target of [0, 0.125, 0.5, 0.87]) {
      const moved = withHandAt(clock, sample, hand, target, 'UTC')
      const movedPosition = clock.hands(moved, 'UTC')[hand]
      assert.ok(movedPosition !== null)
      closeTurn(movedPosition, target, 1e-4, `${clock.id} ${hand} round trip`)
      // The short way around never travels more than half a revolution.
      assert.ok(
        Math.abs(moved.getTime() - sample.getTime()) <= period / 2 + 1,
        `${clock.id} ${hand}: took the long way to ${target}`,
      )
    }
  }
}

// Hands are geared: placing the hour hand halfway between 3 and 4 carries the
// minute hand to 30 rather than leaving it where it was.
const geared = withHandAt(civil12, localTime(2026, 6, 15, 1, 0, 0), 'major', 3.5 / 12)
assert.equal(geared.getHours(), 3)
assert.equal(geared.getMinutes(), 30)
assert.equal(geared.getSeconds(), 0)

// Winding the minute hand forward past the top carries the hour with it,
// instead of rewinding most of the way around the dial.
const carried = withHandAt(civil12, localTime(2026, 6, 15, 11, 58, 0), 'middle', 1.2 / 60)
assert.equal(carried.getHours(), 12)
assert.equal(carried.getMinutes(), 1)
assert.equal(carried.getSeconds(), 12)

// A zone-aware clock lands on the requested angle in that zone, not the host's.
const zoned = withHandAt(civil24, utcNoon, 'major', 6 / 24, 'Asia/Kolkata')
assert.equal(civil24.hands(zoned, 'Asia/Kolkata').major, 6 / 24)

const marsJan6 = new Date(Date.UTC(2000, 0, 6, 0, 0, 0))
assert.ok(Math.abs(marsSolDate(marsJan6) - 44796) < 0.002)
assert.ok(lmstFraction(marsJan6, 'airy') < 0.002 || lmstFraction(marsJan6, 'airy') > 0.998)

const mean24 = marsClockDrivers.find((item) => item.id === 'mars-mean-24')
const mean12 = marsClockDrivers.find((item) => item.id === 'mars-mean-12')
assert.ok(mean24 && mean12)
assert.match(mean24.label(marsJan6, undefined, 'airy'), /MTC$/)
assert.match(mean24.label(marsJan6, undefined, 'curiosity'), /LMST$/)
closeTurn(mean24.hands(marsJan6, 'airy').major, lmstFraction(marsJan6, 'airy'), 1e-6, 'mars 24 MTC')

const curiosityLand = new Date(Date.UTC(2012, 7, 6, 5, 17, 57))
const galeNoon = withHandAt(mean24, curiosityLand, 'major', 0.5, 'curiosity')
closeTurn(mean24.hands(galeNoon, 'curiosity').major, 0.5, 1e-4, 'Gale local noon')

for (const clock of marsClockDrivers) {
  if (clock.id === 'mars-apparent-24') continue
  const frame = clock.frameMs(curiosityLand, 'curiosity')
  const utcHands = clock.hands(curiosityLand, 'curiosity')
  for (const hand of handNames) {
    const period = clock.periods[hand]
    const position = utcHands[hand]
    if (period === null || position === null) continue
    closeTurn(position, fraction(frame / period), 1e-9, `${clock.id} ${hand} period`)
    for (const target of [0, 0.125, 0.5, 0.87]) {
      const moved = withHandAt(clock, curiosityLand, hand, target, 'curiosity')
      const movedPosition = clock.hands(moved, 'curiosity')[hand]
      assert.ok(movedPosition !== null)
      closeTurn(movedPosition, target, 1e-4, `${clock.id} ${hand} round trip`)
    }
  }
}

const apparent = marsClockDrivers.find((item) => item.id === 'mars-apparent-24')
assert.ok(apparent)
assert.match(apparent.label(curiosityLand, undefined, 'curiosity'), /LTST$/)
assert.ok(apparent.hands(curiosityLand, 'curiosity').major >= 0)

console.log('clocks: ok')
