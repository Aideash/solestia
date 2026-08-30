import {
  ELEMENTS_VALID_FROM_MS,
  ELEMENTS_VALID_TO_MS,
  PLANETS,
  SUN,
  frameFor,
} from '../src/data/planets.ts'
import {
  bodyFrame,
  clampEpoch,
  equatorialToEcliptic,
  solarSystemAt,
  wrapRadSigned,
} from '../src/lib/kepler.ts'

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
assert(
  Math.abs(deg(earthPeri.inclination)) < 0.01,
  `Earth inclination to the J2000 ecliptic should be ~0°, got ${deg(earthPeri.inclination).toFixed(4)}°`,
)
assert(
  Math.abs(mercury.e - 0.2056) < 0.001,
  `Mercury eccentricity should be ~0.2056, got ${mercury.e}`,
)
assert(
  Math.abs(deg(mercury.w0) - 329.5988) < 0.01,
  `Mercury W0 (IAU) should be ~329.6°, got ${deg(mercury.w0).toFixed(3)}°`,
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

/** Smallest distance between two clock fractions, allowing for the wrap at 1. */
function fractionGap(a: number, b: number): number {
  const diff = Math.abs(a - b) % 1
  return Math.min(diff, 1 - diff)
}

function planetAt(
  dateIso: string,
  id: string,
  rotationFrame: 'iau' | 'magnetic' | 'cloud' = 'iau',
) {
  const state = solarSystemAt(new Date(dateIso), rotationFrame).planets.find((p) => p.id === id)
  assert(state, `${id} missing from ${dateIso} snapshot`)
  return state
}

// Local solar noon at Greenwich. The gap from exactly 0.5 is the equation of
// time, a few minutes either way, plus ~75 s from the IAU's approximate
// expression for Earth's prime meridian.
for (const noon of ['2026-01-03T12:00:00Z', '2026-06-21T12:00:00Z', '2026-09-15T12:00:00Z']) {
  const earth = planetAt(noon, 'earth')
  assert(
    fractionGap(earth.dayFraction, 0.5) < 0.012,
    `Earth should read local noon at ${noon}, got ${earth.dayFraction.toFixed(4)} of a day`,
  )
}

const earthMidnight = planetAt('2026-06-21T00:00:00Z', 'earth')
assert(
  fractionGap(earthMidnight.dayFraction, 0) < 0.012,
  `Earth should read local midnight at 00:00 UT, got ${earthMidnight.dayFraction.toFixed(4)}`,
)

const earthEvening = planetAt('2026-06-21T18:00:00Z', 'earth')
assert(
  fractionGap(earthEvening.dayFraction, 0.75) < 0.012,
  `Earth should be three quarters through its day at 18:00 UT, got ${earthEvening.dayFraction.toFixed(4)}`,
)

assert(
  fractionGap(earthPeri.yearFraction, 0) < 0.01,
  `Earth's year dial should sit at perihelion on 2026-01-03, got ${earthPeri.yearFraction.toFixed(4)}`,
)
assert(
  fractionGap(earthAph.yearFraction, 0.5) < 0.01,
  `Earth's year dial should be half way at aphelion, got ${earthAph.yearFraction.toFixed(4)}`,
)

// The subsolar point reaches the tropics at the solstices, which exercises the
// 3D position, the ecliptic-to-equatorial rotation and the pole together.
const junSolstice = planetAt('2026-06-21T09:00:00Z', 'earth')
const decSolstice = planetAt('2026-12-21T15:00:00Z', 'earth')
assert(
  Math.abs(deg(junSolstice.subsolarLatitude) - 23.44) < 0.02,
  `Sun should stand over the Tropic of Cancer in June, got ${deg(junSolstice.subsolarLatitude).toFixed(2)}°`,
)
assert(
  Math.abs(deg(decSolstice.subsolarLatitude) + 23.44) < 0.02,
  `Sun should stand over the Tropic of Capricorn in December, got ${deg(decSolstice.subsolarLatitude).toFixed(2)}°`,
)

// One solar day later every dial should read the same time, which is what
// proves the hour angle runs forwards on the retrograde rotators too.
const dayStart = solarSystemAt(new Date('2026-03-05T00:00:00Z'))
for (const planet of dayStart.planets) {
  const later = new Date(dayStart.at.getTime() + planet.solarDayDays * 86_400_000)
  const nextDay = planetAt(later.toISOString(), planet.id)
  // Apparent solar time vs the mean solar day: Venus's slow retrograde spin
  // leaves a few minutes of equation-of-time drift. Periods now share one W.
  const tolerance = planet.id === 'venus' ? 0.005 : 0.001
  assert(
    fractionGap(planet.dayFraction, nextDay.dayFraction) < tolerance,
    `${planet.name} should read the same local time one solar day on, off by ${fractionGap(
      planet.dayFraction,
      nextDay.dayFraction,
    ).toFixed(4)}`,
  )
}

// At local noon at Greenwich the prime meridian faces the Sun, so it should
// point back down Earth's heliocentric longitude, half a turn from the planet.
for (const noon of ['2026-01-03T12:00:00Z', '2026-06-21T12:00:00Z']) {
  const earth = planetAt(noon, 'earth')
  const gap = deg(wrapRadSigned(earth.facing.longitude - earth.longitude - Math.PI))
  assert(
    Math.abs(gap) < 5,
    `Earth's prime meridian should face the Sun at ${noon}, off by ${gap.toFixed(2)}°`,
  )
}

// Uranus spins about a pole lying almost in the ecliptic, so its meridian swings
// far out of the plane; the inner planets keep theirs close to it.
for (const planet of dayStart.planets) {
  assert(
    planet.facing.inPlane >= 0 && planet.facing.inPlane <= 1,
    `${planet.name} facing projection should be a unit length, got ${planet.facing.inPlane}`,
  )
}
const uranusMin = Math.min(
  ...Array.from({ length: 64 }, (_, i) => {
    const at = new Date(dayStart.at.getTime() + (i / 64) * 0.718 * 86_400_000)
    return planetAt(at.toISOString(), 'uranus').facing.inPlane
  }),
)
assert(
  uranusMin < 0.3,
  `Uranus should tip its meridian out of the ecliptic, floor was ${uranusMin}`,
)

function hoursFromWDot(wDot: number): number {
  return (360 / Math.abs(wDot)) * 24
}

const neptune = PLANETS.find((p) => p.id === 'neptune')
const jupiter = PLANETS.find((p) => p.id === 'jupiter')
assert(neptune && jupiter, 'Neptune or Jupiter missing from catalogue')

assert(
  Math.abs(hoursFromWDot(frameFor(neptune, 'iau').wDot) - 15.966) < 0.01,
  `Neptune IAU/cloud should be ~15.97 h, got ${hoursFromWDot(frameFor(neptune, 'iau').wDot)}`,
)
assert(
  Math.abs(hoursFromWDot(frameFor(neptune, 'cloud').wDot) - 15.966) < 0.01,
  'Neptune cloud should be the IAU 2015 W',
)
assert(
  Math.abs(hoursFromWDot(frameFor(neptune, 'magnetic').wDot) - 16.11) < 0.01,
  `Neptune magnetic should be ~16.11 h, got ${hoursFromWDot(frameFor(neptune, 'magnetic').wDot)}`,
)

const jupiterIauHours = hoursFromWDot(frameFor(jupiter, 'iau').wDot)
const jupiterMagHours = hoursFromWDot(frameFor(jupiter, 'magnetic').wDot)
const jupiterCloudHours = hoursFromWDot(frameFor(jupiter, 'cloud').wDot)
assert(
  Math.abs(jupiterIauHours - jupiterMagHours) < 1e-9,
  'Jupiter IAU should be magnetic System III',
)
assert(
  Math.abs(jupiterCloudHours - 9.8417) < 0.002,
  `Jupiter cloud (System I) should be ~9.84 h, got ${jupiterCloudHours}`,
)
assert(jupiterCloudHours < jupiterIauHours, 'Jupiter System I should spin faster than System III')

const neptuneMag = solarSystemAt(new Date('2026-03-05T00:00:00Z'), 'magnetic').planets.find(
  (p) => p.id === 'neptune',
)
assert(neptuneMag, 'Neptune missing from magnetic snapshot')
assert(
  Math.abs(neptuneMag.siderealRotationDays * 24 - 16.11) < 0.01,
  `Neptune magnetic table period should be ~16.11 h, got ${neptuneMag.siderealRotationDays * 24}`,
)

// The IAU pole should reproduce the hand-converted ecliptic spin axis, and its
// prime meridian rate should reproduce the tabulated rotation period.
for (const body of [...PLANETS, SUN]) {
  const pole = equatorialToEcliptic(bodyFrame(body.iau, 0).pole)
  const spin = Math.sign(body.iau.wDot)
  const theta = deg(Math.acos(spin * pole.z))
  const phi = (deg(Math.atan2(spin * pole.y, spin * pole.x)) + 360) % 360
  assert(
    Math.abs(theta - body.rotation.theta) < 0.001,
    `${body.name} IAU pole tilt ${theta.toFixed(4)}° should match stored ${body.rotation.theta}°`,
  )
  const phiGap = Math.abs((((phi - body.rotation.phi + 540) % 360) - 180) % 360)
  assert(
    phiGap < 0.001,
    `${body.name} IAU pole azimuth ${phi.toFixed(4)}° should match stored ${body.rotation.phi}°`,
  )
  const iauRotationDays = 360 / Math.abs(body.iau.wDot)
  const storedRotationDays = (2 * Math.PI) / body.rotation.r
  assert(
    Math.abs(iauRotationDays - storedRotationDays) < 1e-12,
    `${body.name} IAU rotation ${iauRotationDays.toFixed(6)} d should match stored ${storedRotationDays.toFixed(6)} d`,
  )
}

// The Sun spins on the Carrington W in every frame, tilted 7.25° from ecliptic
// north, so its meridian stays close to the plane and repeats after one period.
const sun = dayStart.sun
assert(
  Math.abs(sun.siderealRotationDays - 25.38) < 0.005,
  `Carrington rotation should be ~25.38 d, got ${sun.siderealRotationDays}`,
)
assert(
  Math.abs(deg(sun.obliquity) - 7.25) < 0.01,
  `Sun's axis should tilt ~7.25° from ecliptic north, got ${deg(sun.obliquity).toFixed(3)}°`,
)
for (const frame of ['magnetic', 'cloud'] as const) {
  assert(
    frameFor(SUN, frame).wDot === SUN.iau.wDot,
    `Sun should stay on the Carrington W in the ${frame} frame`,
  )
}
const sunTurn = solarSystemAt(
  new Date(dayStart.at.getTime() + sun.siderealRotationDays * 86_400_000),
).sun
assert(
  Math.abs(deg(wrapRadSigned(sunTurn.facing.longitude - sun.facing.longitude))) < 0.1,
  `Sun's meridian should return after one rotation, off by ${deg(
    wrapRadSigned(sunTurn.facing.longitude - sun.facing.longitude),
  ).toFixed(3)}°`,
)
const sunInPlane = Math.min(
  ...Array.from({ length: 64 }, (_, i) => {
    const at = new Date(dayStart.at.getTime() + (i / 64) * sun.siderealRotationDays * 86_400_000)
    return solarSystemAt(at).sun.facing.inPlane
  }),
)
assert(
  sunInPlane > 0.99,
  `Sun's meridian should stay near the ecliptic plane, floor was ${sunInPlane}`,
)

console.log(
  `ok  Earth ν ${deg(earthPeri.trueAnomaly).toFixed(1)}° on 2026-01-03, ${deg(earthAph.trueAnomaly).toFixed(1)}° on 2026-07-04`,
)
const clampedEarly = clampEpoch(new Date(1799, 11, 31))
assert(
  clampedEarly.getTime() === ELEMENTS_VALID_FROM_MS,
  `dates before 1800 should clamp to ${new Date(ELEMENTS_VALID_FROM_MS).toISOString()}, got ${clampedEarly.toISOString()}`,
)
const clampedLate = clampEpoch(new Date(2051, 0, 1))
assert(
  clampedLate.getTime() === ELEMENTS_VALID_TO_MS,
  `dates after 2050 should clamp to ${new Date(ELEMENTS_VALID_TO_MS).toISOString()}, got ${clampedLate.toISOString()}`,
)
const inside = new Date('2026-01-03T12:00:00Z')
assert(
  clampEpoch(inside) === inside,
  'dates inside the validity window should be returned unchanged',
)
console.log('ok  epoch clamp is local 1800-01-01 … 2050-12-31')
console.log(
  `ok  Earth local solar time ${(earthPeri.dayFraction * 24).toFixed(2)} h at 12:00 UT, subsolar latitude ${deg(junSolstice.subsolarLatitude).toFixed(2)}° at the June solstice`,
)
