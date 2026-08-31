import {
  ELEMENTS_VALID_FROM_MS,
  ELEMENTS_VALID_TO_MS,
  PLANETS,
  SUN,
  frameFor,
} from '../src/data/planets.ts'
import { MOONS } from '../src/data/moons.ts'
import {
  bodyFrame,
  clampEpoch,
  eccentricityWobble,
  equatorialToEcliptic,
  jupiterSystemAt,
  planetSystemAt,
  satelliteIauFrame,
  solarSystemAt,
  wrapRadSigned,
} from '../src/lib/kepler.ts'
import { radialScale } from '../src/lib/radialScale.ts'

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

const j2000 = jupiterSystemAt(new Date('2000-01-01T12:00:00Z'))
assert(j2000.satellites.length === 4, `expected 4 Galilean moons, got ${j2000.satellites.length}`)
const io = j2000.satellites.find((m) => m.id === 'io')
assert(io, 'Io missing from Jupiter system')
assert(io.aKm === 421800, `Io a should be 421800 km, got ${io.aKm}`)
assert(
  Math.abs(deg(io.meanAnomaly) - 330.9) < 0.2,
  `Io mean anomaly at J2000 should be ~330.9°, got ${deg(io.meanAnomaly).toFixed(2)}°`,
)

for (const moon of j2000.satellites) {
  assert(
    Number.isFinite(moon.solarDayDays) && moon.solarDayDays < moon.siderealOrbitDays * 1.02,
    `${moon.name} solar day should be finite and close to its month, got ${moon.solarDayDays} vs orbit ${moon.siderealOrbitDays}`,
  )
  assert(
    Math.abs(moon.solarDayDays - moon.siderealOrbitDays) / moon.siderealOrbitDays < 0.02,
    `${moon.name} solar day ${moon.solarDayDays} should be within 2% of sidereal month ${moon.siderealOrbitDays}`,
  )
  const inward = deg(wrapRadSigned(moon.facing.longitude - moon.longitude - Math.PI))
  assert(
    Math.abs(inward) < 25,
    `${moon.name} prime meridian should face Jupiter (inward), off by ${inward.toFixed(1)}°`,
  )
  assert(
    Math.abs(moon.siderealOrbitDays / moon.siderealRotationDays - 1) < 1e-4,
    `${moon.name} should be synchronous, spin–orbit ratio ${moon.siderealOrbitDays / moon.siderealRotationDays}`,
  )
  assert(
    moon.parentDayDays === Number.POSITIVE_INFINITY,
    `${moon.name} is locked, so its parent day should be infinite, got ${moon.parentDayDays}`,
  )
}

/** Folding the precession into the tabulated M period should give these. */
const SIDEREAL_MONTHS: Record<string, number> = {
  io: 1.769138,
  europa: 3.551181,
  ganymede: 7.154553,
  callisto: 16.689018,
}

for (const moon of j2000.satellites) {
  const expected = SIDEREAL_MONTHS[moon.id]
  assert(
    Math.abs(moon.siderealOrbitDays - expected) < 1e-3,
    `${moon.name} sidereal month should be ~${expected} d, got ${moon.siderealOrbitDays.toFixed(6)}`,
  )
}

// The lock has to hold over decades, not just at the epoch: a precession term
// with the wrong sign leaves the epoch untouched and walks the sub-Jupiter point
// right around the moon within a year.
const late = jupiterSystemAt(new Date('2049-01-01T12:00:00Z'))
for (const moon of late.satellites) {
  const inward = deg(wrapRadSigned(moon.facing.longitude - moon.longitude - Math.PI))
  assert(
    Math.abs(inward) < 6,
    `${moon.name} prime meridian should still face Jupiter in 2049, off by ${inward.toFixed(1)}°`,
  )
}

const earthSystem = planetSystemAt(new Date('2000-01-01T12:00:00Z'), 'earth')
assert(earthSystem.satellites.length === 1, 'Earth system should contain one moon')
const moon = earthSystem.satellites[0]
assert(moon?.id === 'moon', 'Moon missing from Earth system')
assert(moon.aKm === 384400, `Moon a should be 384400 km, got ${moon.aKm}`)
assert(
  Math.abs(moon.siderealOrbitDays - 27.322) < 0.001,
  `Moon sidereal month should be ~27.322 d, got ${moon.siderealOrbitDays}`,
)
assert(
  moon.parentDayDays === Number.POSITIVE_INFINITY,
  `Moon is locked, so its Earth day should be infinite, got ${moon.parentDayDays}`,
)
const moonInward = deg(wrapRadSigned(moon.facing.longitude - moon.longitude - Math.PI))
assert(
  Math.abs(moonInward) < 6,
  `Moon prime meridian should face Earth (inward), off by ${moonInward.toFixed(1)}°`,
)

// First order the wobble is 2e; Earth's is the 7.7 min eccentricity term of the
// equation of time.
assert(eccentricityWobble(0) === 0, 'a circular orbit should have no wobble')
const earthWobble = deg(eccentricityWobble(earthPeri.e))
assert(
  Math.abs(earthWobble - 1.915) < 0.01,
  `Earth eccentricity wobble should be ~1.915°, got ${earthWobble.toFixed(3)}°`,
)

for (const moon of MOONS) {
  let pole = equatorialToEcliptic(bodyFrame(satelliteIauFrame(moon, 0), 0).pole)
  if (moon.iau.wDot < 0) pole = { x: -pole.x, y: -pole.y, z: -pole.z }
  const theta = deg(Math.acos(pole.z))
  const phi = (deg(Math.atan2(pole.y, pole.x)) + 360) % 360
  assert(
    Math.abs(theta - moon.rotation.theta) < 0.002,
    `${moon.name} IAU pole tilt ${theta.toFixed(4)}° should match stored ${moon.rotation.theta}°`,
  )
  const phiGap = Math.abs((((phi - moon.rotation.phi + 540) % 360) - 180) % 360)
  assert(
    phiGap < 0.002,
    `${moon.name} IAU pole azimuth ${phi.toFixed(4)}° should match stored ${moon.rotation.phi}°`,
  )
}

console.log(
  `ok  Galilean moons at J2000: Io ν ${deg(io.trueAnomaly).toFixed(1)}°, sidereal month ${io.siderealOrbitDays.toFixed(6)} d, solar day ${io.solarDayDays.toFixed(4)} d, Jupiter day ${io.parentDayDays}`,
)
console.log(
  `ok  Earth–Moon system at J2000: month ${moon.siderealOrbitDays.toFixed(3)} d, Earth-facing offset ${moonInward.toFixed(1)}°`,
)
const uranusJ2000 = planetSystemAt(new Date('2000-01-01T12:00:00Z'), 'uranus')
assert(
  uranusJ2000.satellites.length === 5,
  `expected 5 major Uranian moons, got ${uranusJ2000.satellites.length}`,
)
const URANIAN_SIDEREAL_MONTHS: Record<string, number> = {
  miranda: 1.413479,
  ariel: 2.520379,
  umbriel: 4.144177,
  titania: 8.705869,
  oberon: 13.463237,
}
const uranusLate = planetSystemAt(new Date('2049-01-01T12:00:00Z'), 'uranus')
for (const moon of uranusJ2000.satellites) {
  const expected = URANIAN_SIDEREAL_MONTHS[moon.id]
  assert(expected, `${moon.name} missing from Uranian sidereal-month table`)
  assert(
    Math.abs(moon.siderealOrbitDays - expected) < 1e-6,
    `${moon.name} sidereal month should be ~${expected} d, got ${moon.siderealOrbitDays}`,
  )
  assert(
    moon.retrograde,
    `${moon.name} should spin retrograde with Uranus, theta ${deg(moon.obliquity).toFixed(2)}°`,
  )
  assert(
    Math.abs(moon.siderealOrbitDays / moon.siderealRotationDays - 1) < 1e-4,
    `${moon.name} should be synchronous, spin–orbit ratio ${moon.siderealOrbitDays / moon.siderealRotationDays}`,
  )
  assert(
    moon.parentDayDays === Number.POSITIVE_INFINITY,
    `${moon.name} is locked, so its Uranus day should be infinite, got ${moon.parentDayDays}`,
  )
  // These orbits stand nearly on end to the ecliptic, so the 2-D longitude
  // inward test used for the Galileans is not meaningful. The 3-D lock is
  // Uranus standing on the IAU prime meridian.
  assert(
    fractionGap(moon.parentFraction, 0.5) < 0.07,
    `${moon.name} should keep Uranus on its prime meridian, got parent fraction ${moon.parentFraction.toFixed(3)}`,
  )
}
for (const moon of uranusLate.satellites) {
  assert(
    fractionGap(moon.parentFraction, 0.5) < 0.02,
    `${moon.name} should still keep Uranus on its prime meridian in 2049, got parent fraction ${moon.parentFraction.toFixed(3)}`,
  )
}

const arielEq = uranusJ2000.satellites.find((m) => m.id === 'ariel')
assert(arielEq, 'Ariel missing from Uranus system')
const arielTrueInEquator = wrapRadSigned(
  arielEq.equatorLongitude - arielEq.equatorPeriapsis + arielEq.trueAnomaly,
)
assert(
  Math.abs(arielTrueInEquator) < 0.05,
  `Ariel’s equatorial azimuth from periapsis should be −ν (IAU north), off by ${deg(arielTrueInEquator).toFixed(2)}°`,
)
assert(
  arielEq.equatorFacing.inPlane > 0.85,
  `Ariel’s prime meridian should lie in Uranus’s equator, inPlane ${arielEq.equatorFacing.inPlane.toFixed(3)}`,
)
const arielQuarterMs = arielEq.siderealOrbitDays * 0.25 * 86_400_000
const arielLater = planetSystemAt(
  new Date(new Date('2000-01-01T12:00:00Z').getTime() + arielQuarterMs),
  'uranus',
).satellites.find((m) => m.id === 'ariel')
assert(arielLater, 'Ariel missing a quarter-orbit later')
const arielStep = Math.abs(wrapRadSigned(arielLater.equatorLongitude - arielEq.equatorLongitude))
assert(
  Math.abs(arielStep - Math.PI / 2) < 0.2,
  `Ariel should advance ~90° in Uranus’s equator in a quarter month, moved ${deg(arielStep).toFixed(1)}°`,
)

const uranusEquinox = planetSystemAt(new Date('2007-12-07T12:00:00Z'), 'uranus')
const uranusSolstice = planetSystemAt(new Date('1986-01-24T12:00:00Z'), 'uranus')
assert(
  uranusEquinox.sunEquator.inPlane > uranusSolstice.sunEquator.inPlane,
  `Sun should lie closer to Uranus’s equator at the 2007 equinox (inPlane ${uranusEquinox.sunEquator.inPlane.toFixed(2)}) than at the 1986 solstice (${uranusSolstice.sunEquator.inPlane.toFixed(2)})`,
)
assert(
  uranusSolstice.sunEquator.inPlane < 0.45,
  `Sun should be near a Uranian pole at the 1986 solstice, inPlane ${uranusSolstice.sunEquator.inPlane.toFixed(2)}`,
)
assert(
  uranusEquinox.sunEquator.inPlane > 0.7,
  `Sun should sit on Uranus’s equator at the 2007 equinox, inPlane ${uranusEquinox.sunEquator.inPlane.toFixed(2)}`,
)

console.log(
  `ok  eccentricity wobble: Io libration ±${deg(eccentricityWobble(io.e)).toFixed(3)}°, Earth equation of time ±${earthWobble.toFixed(3)}°`,
)
const miranda = uranusJ2000.satellites.find((m) => m.id === 'miranda')
assert(miranda, 'Miranda missing from Uranus system')
console.log(
  `ok  Uranian moons at J2000: Miranda ν ${deg(miranda.trueAnomaly).toFixed(1)}°, sidereal month ${miranda.siderealOrbitDays.toFixed(6)} d, Uranus day ${miranda.parentDayDays}`,
)

const neptuneEpoch = new Date('2000-01-01T12:00:00Z')
const neptuneJ2000 = planetSystemAt(neptuneEpoch, 'neptune')
assert(
  neptuneJ2000.satellites.length === 3,
  `expected 3 selected Neptunian moons, got ${neptuneJ2000.satellites.length}`,
)
const proteus = neptuneJ2000.satellites.find((m) => m.id === 'proteus')
const triton = neptuneJ2000.satellites.find((m) => m.id === 'triton')
const nereid = neptuneJ2000.satellites.find((m) => m.id === 'nereid')
assert(proteus, 'Proteus missing from Neptune system')
assert(triton, 'Triton missing from Neptune system')
assert(nereid, 'Nereid missing from Neptune system')

assert(
  Math.abs(proteus.siderealOrbitDays - 1.122315) < 1e-5,
  `Proteus sidereal month should be ~1.122315 d, got ${proteus.siderealOrbitDays}`,
)
assert(
  proteus.parentDayDays === Number.POSITIVE_INFINITY && !proteus.orbitRetrograde,
  'Proteus should be synchronously locked in a prograde orbit',
)
assert(
  Math.abs(triton.siderealOrbitDays - 5.876854) < 1e-6,
  `Triton sidereal month should be ~5.876854 d, got ${triton.siderealOrbitDays}`,
)
assert(triton.retrograde && triton.orbitRetrograde, 'Triton should spin and orbit retrograde')
assert(
  triton.parentDayDays === Number.POSITIVE_INFINITY,
  `Triton is locked, so its Neptune day should be infinite, got ${triton.parentDayDays}`,
)
const tritonQuarter = planetSystemAt(
  new Date(neptuneEpoch.getTime() + triton.siderealOrbitDays * 0.25 * 86_400_000),
  'neptune',
).satellites.find((m) => m.id === 'triton')
assert(tritonQuarter, 'Triton missing a quarter-orbit later')
const tritonStep = wrapRadSigned(tritonQuarter.equatorLongitude - triton.equatorLongitude)
assert(
  tritonStep < 0 && Math.abs(Math.abs(tritonStep) - Math.PI / 2) < 0.2,
  `Triton should move retrograde by ~90° in a quarter month, moved ${deg(tritonStep).toFixed(1)}°`,
)
const tritonLate = planetSystemAt(new Date('2049-01-01T12:00:00Z'), 'neptune').satellites.find(
  (m) => m.id === 'triton',
)
assert(tritonLate, 'Triton missing from the 2049 Neptune system')
assert(
  fractionGap(triton.parentFraction, tritonLate.parentFraction) < 0.002,
  `Triton’s sub-Neptune longitude should remain locked through 2049, drifted from ${triton.parentFraction.toFixed(4)} to ${tritonLate.parentFraction.toFixed(4)}`,
)

assert(
  Math.abs(nereid.e - 0.75074) < 1e-6,
  `Nereid eccentricity should be 0.75074, got ${nereid.e}`,
)
assert(
  Math.abs(nereid.siderealRotationDays * 24 - 11.594) < 0.001,
  `Nereid rotation should be 11.594 h, got ${(nereid.siderealRotationDays * 24).toFixed(3)} h`,
)
assert(
  Number.isFinite(nereid.parentDayDays) && nereid.parentDayDays < 0.5,
  `Nereid should have a finite parent day under 12 h, got ${nereid.parentDayDays}`,
)
const nereidLater = planetSystemAt(
  new Date(neptuneEpoch.getTime() + 0.25 * 86_400_000),
  'neptune',
).satellites.find((m) => m.id === 'nereid')
assert(nereidLater, 'Nereid missing six hours later')
assert(
  fractionGap(nereid.parentFraction, nereidLater.parentFraction) > 0.35,
  'Neptune should move substantially around Nereid’s clock over six hours',
)
assert(
  nereid.orbitRadiusRatio >= 1 - nereid.e && nereid.orbitRadiusRatio <= 1 + nereid.e,
  `Nereid radius ratio ${nereid.orbitRadiusRatio} should stay between periapsis and apoapsis`,
)

console.log(
  `ok  Neptunian moons at J2000: Triton month ${triton.siderealOrbitDays.toFixed(6)} d retrograde, Nereid e ${nereid.e.toFixed(5)} and rotation ${(nereid.siderealRotationDays * 24).toFixed(3)} h`,
)

/**
 * Orrery radial scale. The frame numbers mirror the ones in SolarSystemView,
 * but every assertion below is a property of the scale itself and holds for any
 * inner/outer pair: what matters is that a screen radius always grows with true
 * distance, so no orbit is drawn inside one it never reaches.
 */
const INNER_RING = 10
const OUTER_RING = 46
const CENTER_DISC = 3.5

const geometryEpoch = new Date('2026-01-01T00:00:00Z')
const systems: { name: string; orbits: { id: string; a: number; e: number }[] }[] = [
  {
    name: 'solar',
    orbits: solarSystemAt(geometryEpoch).planets.map((p) => ({ id: p.id, a: p.a, e: p.e })),
  },
  ...(['earth', 'jupiter', 'uranus', 'neptune'] as const).map((id) => ({
    name: id,
    orbits: planetSystemAt(geometryEpoch, id).satellites.map((m) => ({
      id: m.id,
      a: m.aKm,
      e: m.e,
    })),
  })),
]

let tightestGap = Number.POSITIVE_INFINITY
for (const system of systems) {
  const scale = radialScale(system.orbits, INNER_RING, OUTER_RING)
  const first = system.orbits[0]
  const last = system.orbits[system.orbits.length - 1]

  const from = first.a * (1 - first.e)
  const to = last.a * (1 + last.e)
  let previousRadius = 0
  for (let step = 0; step <= 400; step++) {
    const radius = scale(from + ((to - from) * step) / 400)
    assert(
      radius > previousRadius,
      `${system.name} radial scale must rise with distance, but stalled or fell at ${radius.toFixed(4)}`,
    )
    previousRadius = radius
  }

  let previousApoapsis = CENTER_DISC
  for (const orbit of system.orbits) {
    const periapsis = scale(orbit.a * (1 - orbit.e))
    const apoapsis = scale(orbit.a * (1 + orbit.e))
    const gap = periapsis - previousApoapsis
    assert(
      gap > 1,
      `${system.name}: ${orbit.id} should clear the orbit inside it by at least 1 unit, got ${gap.toFixed(2)}`,
    )
    assert(
      apoapsis >= periapsis,
      `${system.name}: ${orbit.id} apoapsis ${apoapsis.toFixed(2)} should not fall inside its periapsis ${periapsis.toFixed(2)}`,
    )
    tightestGap = Math.min(tightestGap, gap)
    previousApoapsis = apoapsis
  }

  assert(
    Math.abs(previousApoapsis - OUTER_RING) < 1e-9,
    `${system.name}: the outermost apoapsis should land on the outer ring, got ${previousApoapsis.toFixed(4)}`,
  )
}

const neptuneScale = radialScale(
  systems.find((system) => system.name === 'neptune')!.orbits,
  INNER_RING,
  OUTER_RING,
)
const nereidPeriapsis = neptuneScale(nereid.aKm * (1 - nereid.e))
const tritonApoapsis = neptuneScale(triton.aKm * (1 + triton.e))
assert(
  nereidPeriapsis > tritonApoapsis + 5,
  `Nereid at perineptune should draw well outside Triton, got ${nereidPeriapsis.toFixed(2)} against ${tritonApoapsis.toFixed(2)}`,
)

console.log(
  `ok  orrery radial scale rises with distance in every system, tightest orbit gap ${tightestGap.toFixed(2)} of ${OUTER_RING} units; Nereid’s perineptune draws at ${nereidPeriapsis.toFixed(1)} against Triton at ${tritonApoapsis.toFixed(1)}`,
)
