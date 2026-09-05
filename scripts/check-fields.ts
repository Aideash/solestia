import { PLANETS } from '../src/data/planets.ts'
import { PLANET_SYSTEMS } from '../src/data/planetSystems.ts'
import {
  GRAVITY_SYNODIC_CAMERA,
  gravityCameraFromBasis,
  isBehindCameraShell,
  linearDistanceScale,
  projectOrthographic,
  shellPose,
  sunMarkerKm,
  vecAdd,
  vecDot,
  vecScale,
  vecSub,
} from '../src/lib/camera.ts'
import * as cr3bpModel from '../src/lib/cr3bp.ts'
import {
  EARTH_MOON_MASS_RATIO,
  KM_PER_AU,
  centuriesSinceJ2000,
  planetSystemAt,
  type Vec3,
} from '../src/lib/kepler.ts'
import {
  collinearLagrangeX,
  cr3bpFromEarthMoon,
  effectivePotential,
  effectivePotentialGradient,
  earthMoonMassParameter,
  GM_SUN_KM3_S2,
  lagrangePoints,
  solarTidalGradient,
  solarTidalPotential,
  synodicBasis,
  toSynodic,
} from '../src/lib/cr3bp.ts'
import {
  cavityFromWind,
  dipoleField,
  dipoleFieldLines,
  earthDipole,
  insideMagnetopause,
  magnetopauseNoseKm,
  magnetopausePoints,
  magnetosphereField,
  solarWindStreamlines,
  magneticDipoleMoment,
  MAGNETOPAUSE_NOSE_RE,
  QUIET_PDYN_NPA,
  shueNoseRe,
  tailField,
  TAIL_LENGTH_RE,
  TAIL_LOBE_B_NT,
  TAIL_RADIUS_RE,
} from '../src/lib/magnetosphere.ts'
import { gravitationalPotential, redshiftNsPerDay } from '../src/lib/redshift.ts'
import { pdynAt } from '../src/lib/solarWind.ts'
import { R_EARTH_KM, R_MOON_KM } from '../src/lib/eclipses.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function hypot3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

const mu = earthMoonMassParameter(EARTH_MOON_MASS_RATIO)
assert(Math.abs(mu - 0.0121505856) < 1e-8, `Earth–Moon μ should be ~0.0121505856, got ${mu}`)

const collinear = collinearLagrangeX(mu)
assert(
  Math.abs(collinear.l1 - 0.836915) < 0.001,
  `L1 barycentric x should be ~0.8369 R, got ${collinear.l1}`,
)
assert(
  Math.abs(collinear.l2 - 1.1557) < 0.002,
  `L2 barycentric x should be ~1.1557 R, got ${collinear.l2}`,
)
assert(
  Math.abs(collinear.l3 + 1.00506) < 0.002,
  `L3 barycentric x should be ~-1.0051 R, got ${collinear.l3}`,
)

const meanRKm = 384_400
const system = cr3bpFromEarthMoon({
  moonFromEarthKm: { x: meanRKm, y: 0, z: 0 },
  orbitNormal: { x: 0, y: 0, z: 1 },
  massRatio: EARTH_MOON_MASS_RATIO,
})
const points = lagrangePoints(system)
const l4 = points.l4
const l5 = points.l5
const moon = { x: meanRKm, y: 0, z: 0 }
const earth = { x: 0, y: 0, z: 0 }
const earthToL4 = vecSub(l4, earth)
const moonToL4 = vecSub(l4, moon)
const earthToL5 = vecSub(l5, earth)
const moonToL5 = vecSub(l5, moon)
const angle = (a: Vec3, b: Vec3) =>
  Math.acos(Math.min(1, Math.max(-1, vecDot(a, b) / (hypot3(a) * hypot3(b)))))
assert(
  Math.abs((angle(earthToL4, moon) * 180) / Math.PI - 60) < 0.2,
  'L4 should sit 60° from the Earth–Moon line at Earth',
)
assert(
  Math.abs((angle(moonToL4, vecScale(moon, -1)) * 180) / Math.PI - 60) < 0.2,
  'L4 should sit 60° from the Moon–Earth line at the Moon',
)
assert(
  Math.abs((angle(earthToL5, moon) * 180) / Math.PI - 60) < 0.2,
  'L5 should sit 60° from the Earth–Moon line at Earth',
)
assert(
  Math.abs((angle(moonToL5, vecScale(moon, -1)) * 180) / Math.PI - 60) < 0.2,
  'L5 should sit 60° from the Moon–Earth line at the Moon',
)
assert(l4.y > 0 && l5.y < 0, 'L4 is on +y, L5 on −y in the synodic plane')

for (const [name, point] of Object.entries(points)) {
  const g = effectivePotentialGradient(system, point)
  const mag = hypot3(g)
  assert(mag / system.n2R < 1e-6, `|∇U_eff| at ${name} should vanish, got ${mag} km/s²`)
}

const sunKm = { x: KM_PER_AU, y: 0, z: 0 }
const monopole = GM_SUN_KM3_S2 / KM_PER_AU ** 2
const atEarth = hypot3(solarTidalGradient(sunKm, earth))
assert(
  atEarth / monopole < 1e-12,
  `the indirect term must cancel the Sun's ${monopole} km/s² monopole at Earth, ${atEarth} left over`,
)

const alongSun = solarTidalGradient(sunKm, { x: meanRKm, y: 0, z: 0 })
const acrossSun = solarTidalGradient(sunKm, { x: 0, y: meanRKm, z: 0 })
const expectedTide = (2 * GM_SUN_KM3_S2 * meanRKm) / KM_PER_AU ** 3
assert(
  Math.abs(hypot3(alongSun) / expectedTide - 1) < 0.01,
  `solar tide at the Moon's distance should be ~${expectedTide} km/s², got ${hypot3(alongSun)}`,
)
assert(
  alongSun.x < 0 && acrossSun.y > 0,
  'the solar tide stretches along the Sun line and squeezes across it',
)
assert(
  Math.abs(hypot3(acrossSun) / (0.5 * hypot3(alongSun)) - 1) < 0.01,
  'the cross-Sun squeeze should be half the along-Sun stretch',
)

const earthPullAtMoon = system.gm1 / meanRKm ** 2
const tideFraction = hypot3(alongSun) / earthPullAtMoon
assert(
  tideFraction > 0.008 && tideFraction < 0.015,
  `the solar tide should be ~1% of Earth's pull at the Moon, got ${tideFraction}`,
)

const quadrupole = (r: number, cos: number) =>
  (-GM_SUN_KM3_S2 / (2 * KM_PER_AU ** 3)) * (3 * cos * cos - 1) * r * r
for (const [r, cos, probe] of [
  [meanRKm, 1, { x: meanRKm, y: 0, z: 0 }],
  [meanRKm, 0, { x: 0, y: meanRKm, z: 0 }],
  [
    1.4 * meanRKm,
    Math.cos(Math.PI / 6),
    { x: 1.4 * meanRKm * Math.cos(Math.PI / 6), y: 0.7 * meanRKm, z: 0 },
  ],
] as const) {
  const exact = solarTidalPotential(sunKm, probe)
  assert(
    Math.abs(exact / quadrupole(r, cos) - 1) < 0.005,
    `solar tidal potential should match the tidal quadrupole, got ${exact} vs ${quadrupole(r, cos)}`,
  )
}

const withSun = (sun: Vec3) =>
  cr3bpFromEarthMoon({
    moonFromEarthKm: { x: meanRKm, y: 0, z: 0 },
    orbitNormal: { x: 0, y: 0, z: 1 },
    massRatio: EARTH_MOON_MASS_RATIO,
    sunFromEarthKm: sun,
  })
const span = effectivePotential(system, points.l4) - effectivePotential(system, points.l1)
const outer = { x: 1.42 * meanRKm, y: 0, z: 0 }
const noonU = effectivePotential(withSun(sunKm), outer)
const duskU = effectivePotential(withSun({ x: 0, y: KM_PER_AU, z: 0 }), outer)
assert(span > 0, `U(L4) should sit above U(L1), got a ${span} km²/s² span`)
assert(
  Math.abs(noonU - duskU) / span > 0.05,
  `the Sun should shift U at the contour edge by >5% of the L4–L1 span, got ${
    Math.abs(noonU - duskU) / span
  }`,
)

const sunlit = withSun(sunKm)
for (const [name, point] of Object.entries(lagrangePoints(sunlit))) {
  const residual = hypot3(effectivePotentialGradient(sunlit, point)) / sunlit.n2R
  assert(
    residual > 1e-4 && residual < 0.05,
    `the Sun should leave a small residual at ${name}, got ${residual} of n²R`,
  )
}

type PerturbedPoints = { l4: Vec3 | null; l5: Vec3 | null }
const perturbedTriangularPoints = (
  cr3bpModel as typeof cr3bpModel & {
    perturbedTriangularPoints?: (system: typeof sunlit) => PerturbedPoints
  }
).perturbedTriangularPoints
assert(
  perturbedTriangularPoints,
  'the field model should solve the instantaneous solar-perturbed L4′ and L5′ points',
)

const primed = perturbedTriangularPoints(sunlit)
for (const name of ['l4', 'l5'] as const) {
  const point = primed[name]
  assert(point, `${name.toUpperCase()}′ should converge with the Sun on the Earth–Moon axis`)
  const synodic = toSynodic(point, sunlit.basis)
  const gradient = toSynodic(effectivePotentialGradient(sunlit, point), sunlit.basis)
  assert(Math.abs(synodic.z) < 1e-6, `${name.toUpperCase()}′ should stay in the contour plane`)
  assert(
    Math.hypot(gradient.x, gradient.y) / sunlit.n2R < 1e-7,
    `${name.toUpperCase()}′ should be a stationary point of the displayed potential sheet`,
  )
  assert(
    hypot3(vecSub(point, points[name])) / meanRKm > 0.05,
    `${name.toUpperCase()}′ should visibly separate from its classical reference point`,
  )
}

const unperturbedPrimed = perturbedTriangularPoints(system)
assert(
  unperturbedPrimed.l4 === null && unperturbedPrimed.l5 === null,
  'primed points should only exist when the solar tide is present',
)

for (let degrees = 0; degrees <= 360; degrees += 5) {
  const radians = (degrees * Math.PI) / 180
  const angledSystem = withSun({
    x: KM_PER_AU * Math.cos(radians),
    y: KM_PER_AU * Math.sin(radians),
    z: 0,
  })
  const angledPrimed = perturbedTriangularPoints(angledSystem)
  for (const name of ['l4', 'l5'] as const) {
    const point = angledPrimed[name]
    assert(point, `${name.toUpperCase()}′ should converge at a ${degrees}° Sun angle`)
    const gradient = toSynodic(effectivePotentialGradient(angledSystem, point), angledSystem.basis)
    assert(
      Math.hypot(gradient.x, gradient.y) / angledSystem.n2R < 1e-7,
      `${name.toUpperCase()}′ should remain stationary at a ${degrees}° Sun angle`,
    )
  }
}

for (const [name, startDegrees] of [
  ['l4', 54.5],
  ['l5', 303.5],
] as const) {
  let previous: Vec3 | null = null
  let fastestStep = 0
  for (let step = 0; step <= 20; step++) {
    const degrees = startDegrees + step * 0.1
    const radians = (degrees * Math.PI) / 180
    const point = perturbedTriangularPoints(
      withSun({
        x: KM_PER_AU * Math.cos(radians),
        y: KM_PER_AU * Math.sin(radians),
        z: 0,
      }),
    )[name]
    assert(point, `${name.toUpperCase()}′ should converge through its fastest swing at ${degrees}°`)
    if (previous) {
      const travel = hypot3(vecSub(point, previous)) / meanRKm
      fastestStep = Math.max(fastestStep, travel)
      assert(
        travel < 0.2,
        `${name.toUpperCase()}′ jumped ${travel} lunar distances across a 0.1° Sun step`,
      )
    }
    previous = point
  }
  assert(
    fastestStep > 0.05,
    `${name.toUpperCase()}′ should preserve its physically rapid solar-alignment swing`,
  )
}

const moment = magneticDipoleMoment()
const equator = dipoleField(moment, { x: R_EARTH_KM, y: 0, z: 0 })
const pole = dipoleField(moment, { x: 0, y: 0, z: R_EARTH_KM })
const be = hypot3(equator)
const bp = hypot3(pole)
assert(Math.abs(bp / be - 2) < 0.02, `polar |B| should be 2× equatorial, got ${bp / be}`)
const far = dipoleField(moment, { x: 2 * R_EARTH_KM, y: 0, z: 0 })
assert(
  Math.abs(hypot3(far) / be - 0.125) < 0.01,
  `dipole should fall as r⁻³; 2 R_E equator should be 1/8, got ${hypot3(far) / be}`,
)

const sun = { x: 1, y: 0, z: 0 }
const noseKm = magnetopauseNoseKm()
assert(
  noseKm > R_EARTH_KM * 8 && noseKm < R_EARTH_KM * 13,
  `magnetopause nose ~10 R_E, got ${noseKm}`,
)
assert(insideMagnetopause({ x: noseKm * 0.5, y: 0, z: 0 }, sun), 'inside the cavity toward Earth')
assert(
  !insideMagnetopause({ x: noseKm * 1.2, y: 0, z: 0 }, sun),
  'sunward of the nose is solar wind',
)
assert(noseKm < 384_400, 'magnetopause nose is inside the Moon’s orbit')

const outline = magnetopausePoints(sun, 96)
const alongRe = outline.map((p) => vecDot(p, sun) / R_EARTH_KM)
const radialRe = outline.map((p, i) =>
  Math.sqrt(Math.max(0, (hypot3(p) / R_EARTH_KM) ** 2 - alongRe[i] ** 2)),
)
assert(outline.length > 16, `magnetopause outline needs enough points, got ${outline.length}`)
for (const [i, a] of alongRe.entries()) {
  assert(
    -a <= TAIL_LENGTH_RE * 1.001,
    `outline point ${i} runs ${-a} R_E downtail, past the ${TAIL_LENGTH_RE} R_E cavity`,
  )
  assert(
    radialRe[i] <= TAIL_RADIUS_RE * 1.001,
    `outline point ${i} flares to ${radialRe[i]} R_E, past the ${TAIL_RADIUS_RE} R_E tail radius`,
  )
}

const noseIndex = alongRe.indexOf(Math.max(...alongRe))
for (let i = 0; i + 1 < alongRe.length; i++) {
  const advancing = i < noseIndex
  assert(
    advancing ? alongRe[i] <= alongRe[i + 1] : alongRe[i] >= alongRe[i + 1],
    `outline reverses direction at point ${i} (${alongRe[i]} → ${alongRe[i + 1]} R_E)`,
  )
}

const crossAxis = (() => {
  const first = outline.find((p) => hypot3(vecSub(p, vecScale(sun, vecDot(p, sun)))) > 1)
  assert(first, 'outline must leave the Earth–Sun axis')
  const perp = vecSub(first, vecScale(sun, vecDot(first, sun)))
  return vecScale(perp, 1 / hypot3(perp))
})()
const offsets = outline.map((p) => vecDot(p, crossAxis) / R_EARTH_KM)
const minOffset = Math.min(...offsets)
const maxOffset = Math.max(...offsets)
assert(minOffset < -1, `outline is missing the −${TAIL_RADIUS_RE} R_E flank, min ${minOffset} R_E`)
assert(maxOffset > 1, `outline is missing the +${TAIL_RADIUS_RE} R_E flank, max ${maxOffset} R_E`)
assert(
  Math.abs(maxOffset + minOffset) < 0.05 * maxOffset,
  `outline flanks should mirror, got ${minOffset} and ${maxOffset} R_E`,
)
assert(
  maxOffset > TAIL_RADIUS_RE * 0.9,
  `outline should widen to about the ${TAIL_RADIUS_RE} R_E tail radius, got ${maxOffset} R_E`,
)

// The Shue flare and the tail cylinder cross at a shallow angle a few R_E
// downtail. Capping one with the other outright creased the flank by >20°
// right where the dayside curve settles into the tail.
const worstCreaseDeg = (() => {
  const plane = outline.map((p) => ({ u: vecDot(p, sun), v: vecDot(p, crossAxis) }))
  let worst = 0
  for (let i = 2; i < plane.length; i++) {
    const [a, b, c] = [plane[i - 2], plane[i - 1], plane[i]]
    const before = Math.atan2(b.v - a.v, b.u - a.u)
    const after = Math.atan2(c.v - b.v, c.u - b.u)
    const turn = ((after - before + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
    worst = Math.max(worst, (Math.abs(turn) * 180) / Math.PI)
  }
  return worst
})()
assert(worstCreaseDeg < 6, `magnetopause outline creases by ${worstCreaseDeg}° between segments`)

for (const [i, p] of outline.entries()) {
  assert(
    insideMagnetopause(vecScale(p, 0.98), sun),
    `outline point ${i} should hug the cavity from inside`,
  )
  assert(
    !insideMagnetopause(vecScale(p, 1.02), sun),
    `outline point ${i} should sit on the cavity edge, not inside it`,
  )
}

const windLines = solarWindStreamlines(sun)
assert(windLines.length >= 6, `need draped streamlines on both flanks, got ${windLines.length}`)
for (const [i, line] of windLines.entries()) {
  assert(line.length > 8, `streamline ${i} is too short (${line.length} samples)`)
  for (const [j, p] of line.entries()) {
    assert(!insideMagnetopause(p, sun), `streamline ${i} sample ${j} is inside the magnetopause`)
    if (j === 0) continue
    const along0 = vecDot(line[j - 1], sun)
    const along1 = vecDot(p, sun)
    assert(
      along1 <= along0 + R_EARTH_KM * 1e-6,
      `streamline ${i} runs sunward at sample ${j} (${along0} → ${along1} km)`,
    )
  }
}

function terminatorRadialRe(line: Vec3[]): number {
  let best = line[0]
  let bestAbs = Math.abs(vecDot(best, sun))
  for (const p of line) {
    const abs = Math.abs(vecDot(p, sun))
    if (abs < bestAbs) {
      best = p
      bestAbs = abs
    }
  }
  const along = vecDot(best, sun)
  return Math.sqrt(Math.max(0, hypot3(best) ** 2 - along * along)) / R_EARTH_KM
}

const terminatorRadii = [...new Set(windLines.map(terminatorRadialRe).map((r) => r.toFixed(3)))]
  .map(Number)
  .sort((a, b) => a - b)
const outlineTermRe =
  radialRe[alongRe.reduce((best, a, i) => (Math.abs(a) < Math.abs(alongRe[best]) ? i : best), 0)]
assert(
  terminatorRadii.length >= 3,
  `streamlines should stack in several offset layers, got ${terminatorRadii.join(', ')} R_E`,
)
assert(
  terminatorRadii[0] > outlineTermRe && terminatorRadii[0] < outlineTermRe + 3,
  `innermost streamline should hug the cavity at the terminator (${outlineTermRe} R_E), got ${terminatorRadii[0]} R_E`,
)
assert(
  terminatorRadii[terminatorRadii.length - 1] > terminatorRadii[0] + 4,
  `outer streamlines should sit well outside the inner ones (${terminatorRadii[0]} vs ${terminatorRadii.at(-1)} R_E)`,
)

const upright = magneticDipoleMoment({ x: 0, y: 0, z: 1 })
function worstStretchOnShell(radiusRe: number): number {
  let worst = 0
  for (let i = 0; i < 200; i++) {
    const theta = Math.acos(1 - (2 * (i + 0.5)) / 200)
    for (let j = 0; j < 32; j++) {
      const phi = (j / 32) * 2 * Math.PI
      const p = {
        x: radiusRe * R_EARTH_KM * Math.sin(theta) * Math.cos(phi),
        y: radiusRe * R_EARTH_KM * Math.sin(theta) * Math.sin(phi),
        z: radiusRe * R_EARTH_KM * Math.cos(theta),
      }
      const pure = dipoleField(upright, p)
      worst = Math.max(
        worst,
        hypot3(vecSub(magnetosphereField(upright, p, sun), pure)) / hypot3(pure),
      )
    }
  }
  return worst
}
const stretchAt3 = worstStretchOnShell(3)
const stretchAt6 = worstStretchOnShell(6)
const stretchAt10 = worstStretchOnShell(10)
assert(stretchAt3 < 0.01, `inner field should stay dipolar, ${stretchAt3} stretch at 3 R_E`)
assert(stretchAt6 < 0.15, `mid field should stay mostly dipolar, ${stretchAt6} stretch at 6 R_E`)
assert(
  stretchAt10 > 0.2,
  `the tail should be taking over by the ${MAGNETOPAUSE_NOSE_RE} R_E nose, only ${stretchAt10} at 10 R_E`,
)

const northLobe = magnetosphereField(upright, { x: -20 * R_EARTH_KM, y: 0, z: 6 * R_EARTH_KM }, sun)
const southLobe = magnetosphereField(
  upright,
  { x: -20 * R_EARTH_KM, y: 0, z: -6 * R_EARTH_KM },
  sun,
)
const northAlong = vecDot(northLobe, sun)
const southAlong = vecDot(southLobe, sun)
assert(northAlong < 0, `north lobe should point antisunward, got ${northAlong} nT`)
assert(southAlong > 0, `south lobe should point sunward, got ${southAlong} nT`)
assert(
  Math.min(-northAlong, southAlong) > 0.5 * TAIL_LOBE_B_NT,
  `lobe field should approach ${TAIL_LOBE_B_NT} nT, got ${northAlong} and ${southAlong} nT`,
)

let peakTail = 0
for (let ix = -TAIL_LENGTH_RE; ix <= 12; ix += 0.5) {
  for (let iz = -TAIL_RADIUS_RE; iz <= TAIL_RADIUS_RE; iz += 0.5) {
    const p = { x: ix * R_EARTH_KM, y: 0, z: iz * R_EARTH_KM }
    if (!insideMagnetopause(p, sun)) continue
    peakTail = Math.max(peakTail, hypot3(tailField(upright, p, sun)))
  }
}
assert(
  peakTail < 2 * TAIL_LOBE_B_NT,
  `tail term should stay near the ${TAIL_LOBE_B_NT} nT lobe value, peaked at ${peakTail} nT`,
)

const dayside = magnetosphereField(upright, { x: 8 * R_EARTH_KM, y: 0, z: 3 * R_EARTH_KM }, sun)
const daysidePure = dipoleField(upright, { x: 8 * R_EARTH_KM, y: 0, z: 3 * R_EARTH_KM })
assert(
  hypot3(vecSub(dayside, daysidePure)) / hypot3(daysidePure) < 0.15,
  'the tail term should stay faded out on the dayside',
)

const step = 0.02 * R_EARTH_KM
for (const probe of [
  { x: -12 * R_EARTH_KM, y: 0, z: 2 * R_EARTH_KM },
  { x: -2 * R_EARTH_KM, y: 3 * R_EARTH_KM, z: 4 * R_EARTH_KM },
]) {
  const axes: Vec3[] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ]
  const divergence = axes.reduce((total, axis) => {
    const plus = magnetosphereField(upright, vecAdd(probe, vecScale(axis, step)), sun)
    const minus = magnetosphereField(upright, vecSub(probe, vecScale(axis, step)), sun)
    return total + vecDot(vecSub(plus, minus), axis) / (2 * step)
  }, 0)
  const scale = hypot3(magnetosphereField(upright, probe, sun)) / R_EARTH_KM
  assert(
    Math.abs(divergence) < 5e-3 * scale,
    `∇·B should vanish, got ${divergence / scale} per R_E at ${probe.x / R_EARTH_KM} R_E`,
  )
}

const tilt = (11 * Math.PI) / 180
const tiltedLines = dipoleFieldLines(
  magneticDipoleMoment({ x: Math.sin(tilt), y: 0, z: Math.cos(tilt) }),
  sun,
)
const traced = tiltedLines.flat()
const deepest = Math.min(...traced.map((p) => vecDot(p, sun) / R_EARTH_KM))
assert(deepest < -20, `polar-cap lines should sweep past 20 R_E downtail, deepest ${deepest} R_E`)
for (const p of traced) {
  assert(insideMagnetopause(p, sun), 'traced field lines stay inside the cavity')
}
for (const line of tiltedLines) {
  for (let i = 0; i + 1 < line.length; i++) {
    const hop = hypot3(vecSub(line[i + 1], line[i])) / R_EARTH_KM
    assert(hop < 2, `field line takes a ${hop} R_E jump; tracing should stay smooth`)
  }
}

const tiltAxis = { x: Math.sin(tilt), y: 0, z: Math.cos(tilt) }
const sheetNormal = (() => {
  const off = vecSub(tiltAxis, vecScale(sun, vecDot(tiltAxis, sun)))
  return vecScale(off, 1 / hypot3(off))
})()
const lobeReach = (side: 1 | -1) =>
  tiltedLines.some((line) =>
    line.some(
      (p) => vecDot(p, sun) / R_EARTH_KM < -20 && side * vecDot(p, sheetNormal) > 2 * R_EARTH_KM,
    ),
  )
assert(lobeReach(1), 'the north tail lobe should carry stretched field lines')
assert(lobeReach(-1), 'the south tail lobe should carry stretched field lines')

for (let i = 0; i < tiltedLines.length; i++) {
  for (let j = i + 1; j < tiltedLines.length; j++) {
    const a = tiltedLines[i]
    const b = tiltedLines[j]
    const near = (p: Vec3, q: Vec3) => hypot3(vecSub(p, q)) < 0.02 * R_EARTH_KM
    const [a0, a1] = [a[0], a[a.length - 1]]
    const [b0, b1] = [b[0], b[b.length - 1]]
    assert(
      !((near(a0, b0) && near(a1, b1)) || (near(a0, b1) && near(a1, b0))),
      `lines ${i} and ${j} are the same line drawn twice`,
    )
  }
}

assert(
  Math.abs(shueNoseRe(QUIET_PDYN_NPA) - MAGNETOPAUSE_NOSE_RE) < 0.05,
  `quiet Shue nose should be ~${MAGNETOPAUSE_NOSE_RE} R_E, got ${shueNoseRe(QUIET_PDYN_NPA)}`,
)
assert(
  shueNoseRe(8) < shueNoseRe(QUIET_PDYN_NPA) && shueNoseRe(QUIET_PDYN_NPA) < shueNoseRe(0.5),
  'higher dynamic pressure should compress the magnetopause',
)
const storm = { pdynNPa: 8 }
const stormCavity = cavityFromWind(8)
assert(
  stormCavity.lobeBnT > TAIL_LOBE_B_NT,
  `storm lobes should exceed ${TAIL_LOBE_B_NT} nT, got ${stormCavity.lobeBnT}`,
)
assert(
  Math.abs(stormCavity.lobeBnT / TAIL_LOBE_B_NT - Math.sqrt(8 / QUIET_PDYN_NPA)) < 1e-6,
  'lobe field should scale with sqrt(P)',
)
const stretchStormAt3 = (() => {
  let worst = 0
  for (let i = 0; i < 80; i++) {
    const theta = Math.acos(1 - (2 * (i + 0.5)) / 80)
    for (let j = 0; j < 16; j++) {
      const phi = (j / 16) * 2 * Math.PI
      const p = {
        x: 3 * R_EARTH_KM * Math.sin(theta) * Math.cos(phi),
        y: 3 * R_EARTH_KM * Math.sin(theta) * Math.sin(phi),
        z: 3 * R_EARTH_KM * Math.cos(theta),
      }
      const pure = dipoleField(upright, p)
      worst = Math.max(
        worst,
        hypot3(vecSub(magnetosphereField(upright, p, sun, storm), pure)) / hypot3(pure),
      )
    }
  }
  return worst
})()
assert(
  stretchStormAt3 < 0.02,
  `inner field should stay mostly dipolar in a storm, ${stretchStormAt3} stretch at 3 R_E`,
)
for (const probe of [
  { x: -12 * R_EARTH_KM, y: 0, z: 2 * R_EARTH_KM },
  { x: -2 * R_EARTH_KM, y: 3 * R_EARTH_KM, z: 4 * R_EARTH_KM },
]) {
  const axes: Vec3[] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ]
  const divergence = axes.reduce((total, axis) => {
    const plus = magnetosphereField(upright, vecAdd(probe, vecScale(axis, step)), sun, storm)
    const minus = magnetosphereField(upright, vecSub(probe, vecScale(axis, step)), sun, storm)
    return total + vecDot(vecSub(plus, minus), axis) / (2 * step)
  }, 0)
  const scale = hypot3(magnetosphereField(upright, probe, sun, storm)) / R_EARTH_KM
  assert(
    Math.abs(divergence) < 5e-3 * scale,
    `∇·B should vanish with scaled lobes, got ${divergence / scale} per R_E`,
  )
}
const stormNose = magnetopauseNoseKm(stormCavity.noseRe)
assert(
  !insideMagnetopause({ x: stormNose * 1.2, y: 0, z: 0 }, sun, storm),
  'sunward of a storm nose is still solar wind',
)
assert(
  insideMagnetopause({ x: stormNose * 0.5, y: 0, z: 0 }, sun, storm),
  'inside a compressed cavity should still count as magnetosphere',
)
for (const [i, line] of solarWindStreamlines(sun, storm).entries()) {
  for (const [j, p] of line.entries()) {
    assert(
      !insideMagnetopause(p, sun, storm),
      `storm streamline ${i} sample ${j} is inside the compressed cavity`,
    )
  }
}

const table = {
  startMs: Date.UTC(2024, 0, 1),
  pdynNPa: [2.5, 0, 8],
}
const quietHit = pdynAt(new Date(Date.UTC(2023, 11, 31)), table)
assert(
  quietHit.omniDay === null && quietHit.pdynNPa === QUIET_PDYN_NPA,
  'before the archive is quiet mean',
)
const day0 = pdynAt(new Date(Date.UTC(2024, 0, 1, 12)), table)
assert(
  day0.pdynNPa === 2.5 && !day0.held,
  `first archive day should be 2.5 nPa, got ${day0.pdynNPa} held=${day0.held}`,
)
const fillDay = pdynAt(new Date(Date.UTC(2024, 0, 2)), table)
assert(
  fillDay.pdynNPa === 2.5 && fillDay.held,
  'a missing day should hold the last good OMNI sample',
)
const stormDay = pdynAt(new Date(Date.UTC(2024, 0, 3)), table)
assert(stormDay.pdynNPa === 8 && !stormDay.held, 'later archive day should follow the table')
const after = pdynAt(new Date(Date.UTC(2024, 1, 1)), table)
assert(after.pdynNPa === 8 && after.held, 'past the archive should hold the last sample')

const earthBody = PLANETS.find((planet) => planet.id === 'earth')
assert(earthBody, 'Earth missing')
const surfacePhi = gravitationalPotential(
  [
    { gmKm3s2: system.gm1, positionKm: earth, radiusKm: R_EARTH_KM },
    { gmKm3s2: system.gm2, positionKm: moon, radiusKm: R_MOON_KM },
  ],
  { x: R_EARTH_KM, y: 0, z: 0 },
)
const surfaceNs = redshiftNsPerDay(surfacePhi)
assert(
  surfaceNs > 40_000 && surfaceNs < 80_000,
  `Earth-surface dilation vs infinity ~60 μs/day, got ${surfaceNs} ns/day`,
)

const auKm = KM_PER_AU
const auPhi = gravitationalPotential(
  [{ gmKm3s2: system.gm1, positionKm: earth, radiusKm: R_EARTH_KM }],
  { x: auKm, y: 0, z: 0 },
)
assert(
  Math.abs(auPhi) < Math.abs(surfacePhi) * 0.01,
  'potential at 1 AU is far shallower than at the surface',
)

const snapshot = planetSystemAt(new Date('2000-01-01T12:00:00Z'), 'earth')
const built = cr3bpFromEarthMoon({
  moonFromEarthKm: vecScale(
    vecSub(snapshot.satellites[0].position, snapshot.parent.position),
    KM_PER_AU,
  ),
  orbitNormal: { x: 0, y: 0, z: 1 },
  massRatio: EARTH_MOON_MASS_RATIO,
})
assert(
  built.separationKm > 350_000 && built.separationKm < 420_000,
  'osculating Earth–Moon distance is lunar',
)
// The seed frame used to be built by crossing the dipole axis against a fixed
// direction, with a guard that swapped directions once the axis leaned too far.
// Earth's axis crosses that guard twice a day, snapping every field line to a
// new longitude. Magnetic longitude should turn with the planet and nothing else.
const meridianStepDeg = (() => {
  const from = Date.UTC(2026, 9, 19)
  const stepMinutes = 5
  let worst = 0
  let previous: Vec3 | null = null
  for (let minute = 0; minute <= 60 * 48; minute += stepMinutes) {
    const at = new Date(from + minute * 60_000)
    const { meridian } = earthDipole(earthBody.iau, centuriesSinceJ2000(at) * 36525)
    if (previous) {
      const cos = Math.min(1, Math.max(-1, vecDot(previous, meridian)))
      worst = Math.max(worst, (Math.acos(cos) * 180) / Math.PI)
    }
    previous = meridian
  }
  return worst
})()
// A 5 minute step is 1.25 deg of rotation; the old guard threw in 71 deg jumps.
assert(
  meridianStepDeg < 2,
  `magnetic longitude should only follow Earth's spin, but jumped ${meridianStepDeg} deg in 5 min`,
)

assert(PLANET_SYSTEMS.earth.radiusKm === R_EARTH_KM, 'Earth radius table matches eclipse constant')
assert(centuriesSinceJ2000(snapshot.at) === 0, 'J2000 noon is T=0')
assert(vecAdd({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }).x === 1)

const lookAlongX = { x: 1, y: 0, z: 0 }
assert(
  !isBehindCameraShell({ x: 2, y: 0, z: 0 }, lookAlongX, 1),
  'a far-side point stays in front of a camera on the −look shell',
)
assert(
  !isBehindCameraShell({ x: -0.5, y: 0, z: 0 }, lookAlongX, 1),
  'a near-side point inside the shell is still in front of the camera',
)
assert(
  isBehindCameraShell({ x: -1.5, y: 0, z: 0 }, lookAlongX, 1),
  'zooming the shell inside a near-side radius puts that point behind the camera',
)

const identityCam = gravityCameraFromBasis({
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
})
assert(
  Math.abs(identityCam.longitude - GRAVITY_SYNODIC_CAMERA.longitude) < 1e-12,
  'an aligned Earth–Moon basis keeps the original gravity look',
)
assert(
  Math.abs(identityCam.latitude - GRAVITY_SYNODIC_CAMERA.latitude) < 1e-12,
  'an aligned Earth–Moon basis keeps the original gravity latitude',
)

const moonAlongY = { x: 0, y: meanRKm, z: 0 }
const rotatedBasis = synodicBasis(moonAlongY, { x: 0, y: 0, z: 1 })
const eclipticCam = gravityCameraFromBasis(rotatedBasis)
const viewR = (meanRKm / KM_PER_AU) * 1.55
const scale = linearDistanceScale(viewR, 42)
const synodicMoon = toSynodic(moonAlongY, rotatedBasis)
const oldScreen = projectOrthographic(
  50,
  50,
  vecScale(synodicMoon, 1 / KM_PER_AU),
  shellPose(GRAVITY_SYNODIC_CAMERA),
  scale,
)
const newScreen = projectOrthographic(
  50,
  50,
  vecScale(moonAlongY, 1 / KM_PER_AU),
  shellPose(eclipticCam),
  scale,
)
assert(
  Math.hypot(oldScreen.x - newScreen.x, oldScreen.y - newScreen.y) < 1e-9,
  'ecliptic gravity with a Moon-tracking camera matches the old synodic display',
)

const sunAu = { x: 1, y: 0, z: 0 }
const marker = sunMarkerKm(sunAu, meanRKm)
assert(
  Math.abs(hypot3(marker) / meanRKm - 1.48) < 1e-12,
  `Sun marker sits at 1.48 lunar distances, got ${hypot3(marker) / meanRKm}`,
)
assert(
  marker.x > 0 && Math.abs(marker.y) < 1e-12 && Math.abs(marker.z) < 1e-12,
  'marker follows the Sun',
)
const markerAu = vecScale(marker, 1 / KM_PER_AU)
assert(
  !isBehindCameraShell(markerAu, lookAlongX, viewR),
  'gravity default zoom still sees a far-side Sun marker',
)
assert(
  isBehindCameraShell(markerAu, { x: -1, y: 0, z: 0 }, 0.5 * hypot3(markerAu)),
  'zooming past a near-side Sun hides it behind the camera shell',
)

const gravityScreen = projectOrthographic(
  50,
  50,
  markerAu,
  shellPose(GRAVITY_SYNODIC_CAMERA),
  scale,
)
assert(
  Math.hypot(gravityScreen.x - 50, gravityScreen.y - 50) < 42,
  'gravity default zoom keeps the physical Sun inside the view disc',
)
const magneticScale = linearDistanceScale((32 * R_EARTH_KM) / KM_PER_AU, 42)
const magneticScreen = projectOrthographic(
  50,
  50,
  markerAu,
  shellPose({ longitude: Math.PI / 2, latitude: 0.08 }),
  magneticScale,
)
assert(
  Math.hypot(magneticScreen.x - 50, magneticScreen.y - 50) > 42,
  'magnetism default zoom leaves the physical Sun off the view disc (edge cue)',
)

console.log('check-fields: ok')
