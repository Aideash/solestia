import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { METEOR_PARENTS, type MeteorParentId } from '../src/data/meteorShowers.ts'

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const START_TIME = '1800-01-01'
const HOLDOUT_START_TIME = '1800-04-01'
const STOP_TIME = '2052-01-01'
/**
 * Month-scale knots. Phaethon’s e≈0.89 orbit races through perihelion too fast
 * for the half-year spacing the main-belt generator uses. The app reconstructs
 * those gaps with Keplerian element interpolation, so perihelion can fall
 * between knots without the Cartesian chord through the Sun a Hermite would
 * take. 30 days still samples orientation slowly enough to stay smooth.
 */
const STEP_DAYS = 30
/** Gaussian gravitational constant squared, AU³/day². */
const SOLAR_MU = 0.0002959122082855911
const OUTPUT = resolve('src/data/generated/meteorEphemerides.ts')

type State = {
  jd: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

type Holdout = {
  jd: number
  position: readonly [number, number, number]
}

function queryUrl(command: string, start: string): URL {
  const url = new URL(HORIZONS_URL)
  const params: Record<string, string> = {
    format: 'json',
    COMMAND: `'${command}'`,
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'",
    OUT_UNITS: "'AU-D'",
    VEC_TABLE: "'2'",
    VEC_LABELS: "'NO'",
    CSV_FORMAT: "'YES'",
    VEC_CORR: "'NONE'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${STOP_TIME}'`,
    STEP_SIZE: `'${STEP_DAYS}d'`,
    OBJ_DATA: "'NO'",
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

function parseStates(result: string, expectedMatch: string): State[] {
  const targetLine = result.match(/Target body name:.*$/m)?.[0] ?? ''
  if (!targetLine.toLowerCase().includes(expectedMatch.toLowerCase())) {
    throw new Error(
      `Horizons returned the wrong target for ${expectedMatch}: ${targetLine || result.slice(0, 200)}`,
    )
  }
  const start = result.indexOf('$$SOE')
  const end = result.indexOf('$$EOE')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`No vector table for ${expectedMatch}`)
  }

  return result
    .slice(start + '$$SOE'.length, end)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const cells = line.split(',').map((cell) => cell.trim())
      if (cells.length < 8) throw new Error(`Malformed Horizons row for ${expectedMatch}: ${line}`)
      const values = [cells[0], ...cells.slice(2, 8)].map(Number)
      if (values.some((value) => !Number.isFinite(value))) {
        throw new Error(`Non-finite Horizons row for ${expectedMatch}: ${line}`)
      }
      const [jd, x, y, z, vx, vy, vz] = values
      return { jd, x, y, z, vx, vy, vz }
    })
}

async function fetchStates(command: string, nameMatch: string, start: string): Promise<State[]> {
  const response = await fetch(queryUrl(command, start))
  if (!response.ok) throw new Error(`Horizons HTTP ${response.status} for ${command}`)
  const payload = (await response.json()) as { result?: string; error?: string }
  if (!payload.result) throw new Error(payload.error ?? `No Horizons result for ${command}`)
  return parseStates(payload.result, nameMatch)
}

function solarAcceleration(x: number, y: number, z: number): readonly [number, number, number] {
  const r = Math.hypot(x, y, z)
  const pull = -SOLAR_MU / (r * r * r)
  return [pull * x, pull * y, pull * z]
}

function hermite(a: State, b: State, jd: number): readonly [number, number, number] {
  const span = b.jd - a.jd
  const t = (jd - a.jd) / span
  const t2 = t * t
  const t3 = t2 * t
  const t4 = t3 * t
  const t5 = t4 * t
  const h0 = 1 - 10 * t3 + 15 * t4 - 6 * t5
  const h1 = t - 6 * t3 + 8 * t4 - 3 * t5
  const h2 = 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5
  const h3 = 10 * t3 - 15 * t4 + 6 * t5
  const h4 = -4 * t3 + 7 * t4 - 3 * t5
  const h5 = 0.5 * t3 - t4 + 0.5 * t5
  const accelA = solarAcceleration(a.x, a.y, a.z)
  const accelB = solarAcceleration(b.x, b.y, b.z)
  const axis = (
    pA: number,
    vA: number,
    accA: number,
    pB: number,
    vB: number,
    accB: number,
  ): number =>
    h0 * pA +
    h1 * span * vA +
    h2 * span * span * accA +
    h3 * pB +
    h4 * span * vB +
    h5 * span * span * accB
  return [
    axis(a.x, a.vx, accelA[0], b.x, b.vx, accelB[0]),
    axis(a.y, a.vy, accelA[1], b.y, b.vy, accelB[1]),
    axis(a.z, a.vz, accelA[2], b.z, b.vz, accelB[2]),
  ]
}

function quantize(states: readonly State[]): State[] {
  return states.map((state) => {
    const values = new Float32Array([state.x, state.y, state.z, state.vx, state.vy, state.vz])
    return {
      jd: state.jd,
      x: values[0],
      y: values[1],
      z: values[2],
      vx: values[3],
      vy: values[4],
      vz: values[5],
    }
  })
}

function encode(states: readonly State[]): string {
  const bytes = Buffer.allocUnsafe(states.length * 6 * Float32Array.BYTES_PER_ELEMENT)
  let offset = 0
  for (const state of states) {
    for (const value of [state.x, state.y, state.z, state.vx, state.vy, state.vz]) {
      bytes.writeFloatLE(value, offset)
      offset += Float32Array.BYTES_PER_ELEMENT
    }
  }
  return bytes.toString('base64')
}

function wrappedString(value: string): string {
  const chunks = value.match(/.{1,100}/g) ?? []
  return `    \`${chunks.join('\n')}\`,`
}

function assertUniform(states: readonly State[], id: MeteorParentId) {
  if (states.length < 2) throw new Error(`${id} has too few samples`)
  for (let index = 1; index < states.length; index++) {
    const span = states[index].jd - states[index - 1].jd
    if (Math.abs(span - STEP_DAYS) > 1e-9) {
      throw new Error(`${id} sample ${index} is ${span} days after its predecessor`)
    }
  }
}

function validate(
  samples: readonly State[],
  holdouts: readonly State[],
): { maxPositionErrorAu: number; maxAngularErrorDeg: number } {
  let maxPositionErrorAu = 0
  let maxAngularErrorDeg = 0
  for (const truth of holdouts) {
    const index = Math.floor((truth.jd - samples[0].jd) / STEP_DAYS)
    if (index < 0 || index >= samples.length - 1) continue
    const position = hermite(samples[index], samples[index + 1], truth.jd)
    const error = Math.hypot(position[0] - truth.x, position[1] - truth.y, position[2] - truth.z)
    const predictedLongitude = Math.atan2(position[1], position[0])
    const trueLongitude = Math.atan2(truth.y, truth.x)
    const angularError =
      Math.abs(
        Math.atan2(
          Math.sin(predictedLongitude - trueLongitude),
          Math.cos(predictedLongitude - trueLongitude),
        ),
      ) *
      (180 / Math.PI)
    maxPositionErrorAu = Math.max(maxPositionErrorAu, error)
    maxAngularErrorDeg = Math.max(maxAngularErrorDeg, angularError)
  }
  return { maxPositionErrorAu, maxAngularErrorDeg }
}

function representativeHoldouts(holdouts: readonly State[]): Holdout[] {
  return [0.25, 0.5, 0.75].map((fraction) => {
    const state = holdouts[Math.floor((holdouts.length - 1) * fraction)]
    return { jd: state.jd, position: [state.x, state.y, state.z] }
  })
}

async function main() {
  const encoded: Record<string, string> = {}
  const checks: Record<string, Holdout[]> = {}
  const validation: Record<string, { maxPositionErrorAu: number; maxAngularErrorDeg: number }> = {}
  let startJd = 0
  let sampleCount = 0

  for (const parent of METEOR_PARENTS) {
    process.stdout.write(`Fetching ${parent.name}... `)
    const [rawSamples, holdouts] = await Promise.all([
      fetchStates(parent.horizonsCommand, parent.horizonsNameMatch, START_TIME),
      fetchStates(parent.horizonsCommand, parent.horizonsNameMatch, HOLDOUT_START_TIME),
    ])
    const samples = quantize(rawSamples)
    assertUniform(samples, parent.id)
    if (startJd && samples[0].jd !== startJd) throw new Error(`${parent.id} start mismatch`)
    if (sampleCount && samples.length !== sampleCount)
      throw new Error(`${parent.id} count mismatch`)
    startJd = samples[0].jd
    sampleCount = samples.length
    encoded[parent.id] = encode(samples)
    checks[parent.id] = representativeHoldouts(holdouts)
    validation[parent.id] = validate(samples, holdouts)
    console.log(
      `${samples.length} samples, max ${validation[parent.id].maxAngularErrorDeg.toFixed(5)}°`,
    )
  }

  const source = `/**
 * Generated by scripts/generate-meteor-ephemerides.ts from JPL Horizons.
 * Geometric heliocentric state vectors, J2000 ecliptic, AU and AU/day.
 * Do not edit by hand.
 */
import type { MeteorParentId } from '../meteorShowers.ts'

export const METEOR_EPHEMERIS_START_JD = ${startJd}
export const METEOR_EPHEMERIS_STEP_DAYS = ${STEP_DAYS}
export const METEOR_EPHEMERIS_SAMPLE_COUNT = ${sampleCount}

/** Packed little-endian Float32 tuples: x, y, z, vx, vy, vz. */
export const METEOR_EPHEMERIS_BASE64: Record<MeteorParentId, string> = {
${METEOR_PARENTS.map((parent) => `  '${parent.id}':\n${wrappedString(encoded[parent.id])}`).join('\n')}
}

export const METEOR_EPHEMERIS_HOLDOUTS: Record<
  MeteorParentId,
  readonly { jd: number; position: readonly [number, number, number] }[]
> = ${JSON.stringify(checks, null, 2)}

export const METEOR_EPHEMERIS_VALIDATION: Record<
  MeteorParentId,
  { maxPositionErrorAu: number; maxAngularErrorDeg: number }
> = ${JSON.stringify(validation, null, 2)}
`

  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, source)
  console.log(`Wrote ${OUTPUT}`)
}

await main()
