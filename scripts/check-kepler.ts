import { solarSystemAt, wrapRadSigned } from '../src/lib/kepler.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function deg(rad: number): number {
  return (rad * 180) / Math.PI
}

const perihelion = solarSystemAt(new Date('2026-01-03T12:00:00Z'))
const aphelion = solarSystemAt(new Date('2026-07-04T12:00:00Z'))

const earthPeri = perihelion.planets.find((p) => p.id === 'earth')
const earthAph = aphelion.planets.find((p) => p.id === 'earth')

assert(earthPeri, 'Earth missing from perihelion snapshot')
assert(earthAph, 'Earth missing from aphelion snapshot')

const periNu = wrapRadSigned(earthPeri.trueAnomaly)
const aphNu = wrapRadSigned(earthAph.trueAnomaly - Math.PI)

assert(
  Math.abs(periNu) < 0.35,
  `Earth true anomaly near perihelion should be ~0, got ${deg(earthPeri.trueAnomaly).toFixed(2)}°`,
)
assert(
  Math.abs(aphNu) < 0.35,
  `Earth true anomaly near aphelion should be ~180°, got ${deg(earthAph.trueAnomaly).toFixed(2)}°`,
)

assert(perihelion.planets.length === 8, `expected 8 planets, got ${perihelion.planets.length}`)

console.log(
  `ok  Earth ν ${deg(earthPeri.trueAnomaly).toFixed(1)}° on 2026-01-03, ${deg(earthAph.trueAnomaly).toFixed(1)}° on 2026-07-04`,
)
