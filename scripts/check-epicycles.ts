import { EPICYCLE_FITS, EPICYCLE_PLANET_IDS } from '../src/data/generated/epicycleFits.ts'
import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from '../src/data/planets.ts'
import {
  PTOLEMAIC_DISTANCE_RANGES,
  angleErrorRad,
  distanceComparisonAt,
  epicycleDisplayShells,
  epicycleModelAt,
  geocentricBodyAt,
} from '../src/lib/epicycles.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(
  EPICYCLE_PLANET_IDS.join(',') === 'moon,mercury,venus,sun,mars,jupiter,saturn',
  'epicycle catalog should follow the traditional seven-body order',
)

for (const id of EPICYCLE_PLANET_IDS) {
  const fits = EPICYCLE_FITS[id]
  assert(fits.length === 4, `${id} should have fits for depths 1–4`)

  for (const [index, fit] of fits.entries()) {
    const depth = index + 1
    assert(fit.depth === depth, `${id} fit ${index} should have depth ${depth}`)
    assert(
      fit.fromMs === ELEMENTS_VALID_FROM_MS && fit.toMs === ELEMENTS_VALID_TO_MS,
      `${id} depth ${depth} should fit the full 1800–2050 window`,
    )
    assert(fit.circles.length === depth, `${id} depth ${depth} should contain ${depth} circles`)
    assert(
      Number.isFinite(fit.eccentricity) &&
        fit.eccentricity >= 0 &&
        fit.eccentricity < 0.5 &&
        Number.isFinite(fit.apsisRad) &&
        Number.isFinite(fit.apsisRateRadPerDay),
      `${id} depth ${depth} should contain a valid eccentric deferent and equant`,
    )
    assert(
      fit.circles.every(
        (circle) =>
          Number.isFinite(circle.radius) &&
          circle.radius > 0 &&
          Number.isFinite(circle.phaseRad) &&
          Number.isFinite(circle.rateRadPerDay) &&
          circle.rateRadPerDay !== 0,
      ),
      `${id} depth ${depth} should contain finite rotating circles`,
    )
    assert(
      Number.isFinite(fit.rmsErrorDeg) && Number.isFinite(fit.maxErrorDeg),
      `${id} depth ${depth} should include finite fit errors`,
    )
    assert(
      fit.circles.every(
        (circle, circleIndex) =>
          circleIndex === 0 || circle.radius <= fit.circles[circleIndex - 1].radius,
      ),
      `${id} depth ${depth} should order nested circles from largest to smallest`,
    )
    if (index > 0) {
      assert(
        fit.rmsErrorDeg < fits[index - 1].rmsErrorDeg,
        `${id} depth ${depth} should improve on depth ${depth - 1}`,
      )
    }
  }

  assert(
    fits[3].rmsErrorDeg < fits[0].rmsErrorDeg,
    `${id} four-circle fit should improve on one circle`,
  )
}

const j2000 = new Date('2000-01-01T12:00:00Z')
let nonzeroJ2000Errors = 0
for (const id of EPICYCLE_PLANET_IDS) {
  for (const depth of [1, 2, 3, 4] as const) {
    const model = epicycleModelAt(id, j2000, depth)
    assert(model.arms.length === depth, `${id} depth ${depth} should expose every arm`)
    assert(model.centers.length === depth, `${id} depth ${depth} should expose every center`)
    assert(
      model.arms.every(
        (arm) =>
          Number.isFinite(arm.center.x) &&
          Number.isFinite(arm.center.y) &&
          Number.isFinite(arm.endpoint.x) &&
          Number.isFinite(arm.endpoint.y),
      ),
      `${id} depth ${depth} arm geometry should be finite`,
    )
  }

  const truth = geocentricBodyAt(id, j2000)
  const model = epicycleModelAt(id, j2000, 4)
  if (Math.abs(angleErrorRad(model.longitudeRad, truth.longitudeRad)) > Math.PI / 18_000) {
    nonzeroJ2000Errors++
  }

  const historical = distanceComparisonAt(id, j2000, 4, 'ptolemaic')
  const range = PTOLEMAIC_DISTANCE_RANGES[id]
  assert(historical.unit === 'R⊕', `${id} historical distance should use Earth radii`)
  assert(
    historical.model >= range.min && historical.model <= range.max,
    `${id} historical model distance should stay in its Ptolemaic range`,
  )

  const modern = distanceComparisonAt(id, j2000, 4, 'modern-mean')
  assert(modern.unit === 'AU', `${id} modern distance should use AU`)
  assert(modern.actual === truth.distanceAu, `${id} comparison should retain actual distance`)

  const recent = new Date('2026-09-06T12:00:00Z')
  const recentError = Math.abs(
    angleErrorRad(
      epicycleModelAt(id, recent, 4).longitudeRad,
      geocentricBodyAt(id, recent).longitudeRad,
    ),
  )
  assert(recentError < Math.PI / 9, `${id} should stay within 20° in 2026`)
}
assert(nonzeroJ2000Errors >= 3, 'full-window fits should not force an exact J2000 match')

const mars2039 = new Date('2039-11-13T01:20:51Z')
const mars2039Truth = geocentricBodyAt('mars', mars2039)
const mars2039Error = Math.abs(
  angleErrorRad(epicycleModelAt('mars', mars2039, 2).longitudeRad, mars2039Truth.longitudeRad),
)
assert(
  mars2039Error < Math.PI / 180,
  `two-circle eccentric/equant Mars should be within 1° in 2039, got ${(mars2039Error * 180) / Math.PI}°`,
)
const mars2039FourCircleError = Math.abs(
  angleErrorRad(epicycleModelAt('mars', mars2039, 4).longitudeRad, mars2039Truth.longitudeRad),
)
assert(
  mars2039FourCircleError < Math.PI / 3600,
  `four-circle Mars should be within 1 arcminute in 2039, got ${
    (mars2039FourCircleError * 180 * 60) / Math.PI
  }′`,
)
assert(
  EPICYCLE_FITS.mars[1].rmsErrorDeg < 0.5 && EPICYCLE_FITS.mars[1].maxErrorDeg < 2,
  'two-circle eccentric/equant Mars should stay under 0.5° RMS and 2° maximum',
)
assert(
  EPICYCLE_FITS.moon[1].rmsErrorDeg < 1,
  'the precessing lunar deferent and evection circle should stay under 1° RMS',
)

const directShells = epicycleDisplayShells(1)
const directRadii = EPICYCLE_PLANET_IDS.map((id) => directShells[id].outer)
const directGap = directRadii[1] - directRadii[0]
assert(
  directRadii.every(
    (radius, index) => index === 0 || Math.abs(radius - directRadii[index - 1] - directGap) < 1e-12,
  ),
  'one-circle bodies should use evenly spaced direct tracks',
)

for (const depth of [2, 3, 4] as const) {
  const shells = epicycleDisplayShells(depth)
  for (const [index, id] of EPICYCLE_PLANET_IDS.entries()) {
    const shell = shells[id]
    assert(shell.inner < shell.outer, `${id} depth ${depth} should occupy a visible shell`)
    assert(shell.inner >= 0.1 && shell.outer <= 1, `${id} shell should fit the compressed view`)
    const nextId = EPICYCLE_PLANET_IDS[index + 1]
    if (nextId) {
      assert(
        Math.abs(shell.outer - shells[nextId].inner) < 1e-12,
        `${id} maximum should touch ${nextId} minimum`,
      )
    }
  }
}

assert(
  Math.abs(angleErrorRad(-Math.PI + 0.1, Math.PI - 0.1) - 0.2) < 1e-12,
  'signed angle error should wrap across ±π',
)

console.log('epicycles: full-window fits, geometry, and distance ok')
