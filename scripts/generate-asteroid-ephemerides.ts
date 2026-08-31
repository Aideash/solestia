import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { ASTEROIDS, type AsteroidId } from '../src/data/asteroids.ts'

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const START_TIME = '1800-01-01'
const HOLDOUT_START_TIME = '1800-04-01'
const STOP_TIME = '2052-01-01'
/** Half-year knots: Hermite stays C1, Pallas longitude error stays ~0.1°. */
const STEP_DAYS = 180
const OUTPUT = resolve('src/data/generated/asteroidEphemerides.ts')

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

function queryUrl(number: number, start: string): URL {
  const url = new URL(HORIZONS_URL)
  const params: Record<string, string> = {
    format: 'json',
    COMMAND: `'${number};'`,
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

function parseStates(result: string, expectedName: string): State[] {
  if (!result.includes(`Target body name: ${expectedName}`)) {
    throw new Error(`Horizons returned the wrong target for ${expectedName}`)
  }
  const start = result.indexOf('$$SOE')
  const end = result.indexOf('$$EOE')
  if (start < 0 || end < 0 || end <= start) throw new Error(`No vector table for ${expectedName}`)

  return result
    .slice(start + '$$SOE'.length, end)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const cells = line.split(',').map((cell) => cell.trim())
      if (cells.length < 8) throw new Error(`Malformed Horizons row for ${expectedName}: ${line}`)
      const values = [cells[0], ...cells.slice(2, 8)].map(Number)
      if (values.some((value) => !Number.isFinite(value))) {
        throw new Error(`Non-finite Horizons row for ${expectedName}: ${line}`)
      }
      const [jd, x, y, z, vx, vy, vz] = values
      return { jd, x, y, z, vx, vy, vz }
    })
}

async function fetchStates(number: number, name: string, start: string): Promise<State[]> {
  const response = await fetch(queryUrl(number, start))
  if (!response.ok) throw new Error(`Horizons HTTP ${response.status} for ${number} ${name}`)
  const payload = (await response.json()) as { result?: string; error?: string }
  if (!payload.result) throw new Error(payload.error ?? `No Horizons result for ${number} ${name}`)
  return parseStates(payload.result, `${number} ${name}`)
}

function hermite(a: State, b: State, jd: number): readonly [number, number, number] {
  const span = b.jd - a.jd
  const t = (jd - a.jd) / span
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  return [
    h00 * a.x + h10 * span * a.vx + h01 * b.x + h11 * span * b.vx,
    h00 * a.y + h10 * span * a.vy + h01 * b.y + h11 * span * b.vy,
    h00 * a.z + h10 * span * a.vz + h01 * b.z + h11 * span * b.vz,
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

function assertUniform(states: readonly State[], id: AsteroidId) {
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

  for (const asteroid of ASTEROIDS) {
    process.stdout.write(`Fetching ${asteroid.number} ${asteroid.name}... `)
    const [rawSamples, holdouts] = await Promise.all([
      fetchStates(asteroid.number, asteroid.name, START_TIME),
      fetchStates(asteroid.number, asteroid.name, HOLDOUT_START_TIME),
    ])
    const samples = quantize(rawSamples)
    assertUniform(samples, asteroid.id)
    if (startJd && samples[0].jd !== startJd) throw new Error(`${asteroid.id} start mismatch`)
    if (sampleCount && samples.length !== sampleCount)
      throw new Error(`${asteroid.id} count mismatch`)
    startJd = samples[0].jd
    sampleCount = samples.length
    encoded[asteroid.id] = encode(samples)
    checks[asteroid.id] = representativeHoldouts(holdouts)
    validation[asteroid.id] = validate(samples, holdouts)
    console.log(
      `${samples.length} samples, max ${validation[asteroid.id].maxAngularErrorDeg.toFixed(5)}°`,
    )
  }

  const source = `/**
 * Generated by scripts/generate-asteroid-ephemerides.ts from JPL Horizons.
 * Geometric heliocentric state vectors, J2000 ecliptic, AU and AU/day.
 * Do not edit by hand.
 */
import type { AsteroidId } from '../asteroids.ts'

export const ASTEROID_EPHEMERIS_START_JD = ${startJd}
export const ASTEROID_EPHEMERIS_STEP_DAYS = ${STEP_DAYS}
export const ASTEROID_EPHEMERIS_SAMPLE_COUNT = ${sampleCount}

/** Packed little-endian Float32 tuples: x, y, z, vx, vy, vz. */
export const ASTEROID_EPHEMERIS_BASE64: Record<AsteroidId, string> = {
${ASTEROIDS.map((asteroid) => `  '${asteroid.id}':\n${wrappedString(encoded[asteroid.id])}`).join('\n')}
}

export const ASTEROID_EPHEMERIS_HOLDOUTS: Record<
  AsteroidId,
  readonly { jd: number; position: readonly [number, number, number] }[]
> = ${JSON.stringify(checks, null, 2)}

export const ASTEROID_EPHEMERIS_VALIDATION: Record<
  AsteroidId,
  { maxPositionErrorAu: number; maxAngularErrorDeg: number }
> = ${JSON.stringify(validation, null, 2)}
`

  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, source)
  console.log(`Wrote ${OUTPUT}`)
}

await main()
