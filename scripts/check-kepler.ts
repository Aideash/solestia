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

assert(
  Math.abs(earthPeri.siderealOrbitDays - 365.256) < 0.02,
  `Earth sidereal orbit should be ~365.256 d, got ${earthPeri.siderealOrbitDays}`,
)
assert(
  earthPeri.siderealRotationDays > 0.99 && earthPeri.siderealRotationDays < 1,
  `Earth sidereal rotation should be just under 1 d, got ${earthPeri.siderealRotationDays}`,
)
assert(
  Math.abs(earthPeri.solarDayDays - 1) < 0.0002,
  `Earth solar day should be ~1 d, got ${earthPeri.solarDayDays}`,
)

const mercury = perihelion.planets.find((p) => p.id === 'mercury')
assert(mercury, 'Mercury missing from snapshot')
assert(
  Math.abs(mercury.solarDayDays - 175.94) < 0.05,
  `Mercury solar day should be ~176 d, got ${mercury.solarDayDays}`,
)

const venus = perihelion.planets.find((p) => p.id === 'venus')
assert(venus, 'Venus missing from snapshot')
assert(
  Math.abs(venus.solarDayDays - 116.75) < 0.05,
  `Venus solar day should be ~116.75 d, got ${venus.solarDayDays}`,
)
assert(
  Math.abs(deg(earthPeri.obliquity) - 23.44) < 0.01,
  `Earth obliquity should be ~23.44°, got ${deg(earthPeri.obliquity).toFixed(2)}°`,
)

for (const planet of perihelion.planets) {
  assert(
    planet.siderealRotationDays > 0,
    `${planet.name} rotation period should be positive, got ${planet.siderealRotationDays}`,
  )
}

const retrograde = perihelion.planets.filter((p) => p.retrograde).map((p) => p.id)
assert(
  retrograde.join(',') === 'venus,uranus',
  `expected Venus and Uranus to be retrograde, got ${retrograde.join(',') || 'none'}`,
)

console.log(
  `ok  Earth ν ${deg(earthPeri.trueAnomaly).toFixed(1)}° on 2026-01-03, ${deg(earthAph.trueAnomaly).toFixed(1)}° on 2026-07-04`,
)
