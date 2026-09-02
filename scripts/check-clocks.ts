import assert from 'node:assert/strict'
import { clockDrivers, type ClockDriver } from '../src/lib/clocks.ts'

function driver(id: string): ClockDriver {
  const result = clockDrivers.find((candidate) => candidate.id === id)
  assert.ok(result, `Missing ${id} clock driver`)
  return result
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

for (const clock of clockDrivers) {
  const hands = clock.hands(localTime(2026, 3, 20, 15, 30, 45))
  assert.ok(hands.major >= 0 && hands.major < 1)
  assert.ok(hands.middle >= 0 && hands.middle < 1)
  if (hands.minor !== null) {
    assert.ok(hands.minor >= 0 && hands.minor < 1)
  }
  assert.ok(clock.label(noon).length > 0)
  assert.ok(clock.numerals().length > 0)
}

console.log('clocks: ok')
