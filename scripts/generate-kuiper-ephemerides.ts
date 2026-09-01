import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { KUIPER_OBJECTS, type KuiperObjectId } from '../src/data/kuiperObjects.ts'
import { SOLAR_SYSTEM_MU } from '../src/lib/packedEphemeris.ts'

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const START_TIME = '1800-01-01'
const HOLDOUT_START_TIME = '1800-04-01'
const STOP_TIME = '2052-01-01'
const STEP_DAYS = 180
/**
 * The solar-system barycenter. Every planet is interior to these bodies, so
 * Jupiter pulls the Sun and a Kuiper object almost equally; a Sun-centered
 * frame cannot express that shared motion and instead folds it into the
 * derived orbit as an 11.9-year swing. See SOLAR_SYSTEM_MU.
 */
const CENTER = '500@0'
const OUTPUT = resolve('src/data/generated/kuiperEphemerides.ts')

type State = {
  jd: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

type Holdout = { jd: number; position: readonly [number, number, number] }

function queryUrl(number: number, start: string, majorBody: boolean): URL {
  const url = new URL(HORIZONS_URL)
  const params: Record<string, string> = {
    format: 'json',
    COMMAND: `'${number}${majorBody ? '' : ';'}'`,
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${CENTER}'`,
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

function parseStates(result: string, number: number, expectedName: string): State[] {
  const targetLine = result.match(/Target body name:.*$/m)?.[0] ?? ''
  if (!targetLine.toLowerCase().includes(expectedName.toLowerCase())) {
    throw new Error(
      `Horizons returned the wrong target for ${number} ${expectedName}: ${targetLine || result.slice(0, 200)}`,
    )
  }
  const start = result.indexOf('$$SOE')
  const end = result.indexOf('$$EOE')
  if (start < 0 || end <= start) throw new Error(`No vector table for ${expectedName}`)
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

async function fetchStates(
  number: number,
  name: string,
  start: string,
  majorBody = false,
): Promise<State[]> {
  const response = await fetch(queryUrl(number, start, majorBody))
  if (!response.ok) throw new Error(`Horizons HTTP ${response.status} for ${number} ${name}`)
  const payload = (await response.json()) as { result?: string; error?: string }
  if (!payload.result) throw new Error(payload.error ?? `No Horizons result for ${number} ${name}`)
  return parseStates(payload.result, number, name)
}

function centralAcceleration(x: number, y: number, z: number): readonly [number, number, number] {
  const r = Math.hypot(x, y, z)
  const pull = -SOLAR_SYSTEM_MU / (r * r * r)
  return [pull * x, pull * y, pull * z]
}

/** Must match PackedEphemeris.stateAt, or validation would test a different curve. */
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
  const accelA = centralAcceleration(a.x, a.y, a.z)
  const accelB = centralAcceleration(b.x, b.y, b.z)
  const axis = (pA: number, vA: number, accA: number, pB: number, vB: number, accB: number) =>
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
  return `    \`${(value.match(/.{1,100}/g) ?? []).join('\n')}\`,`
}

function validate(samples: readonly State[], holdouts: readonly State[]) {
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
  const encoded = {} as Record<KuiperObjectId, string>
  const checks = {} as Record<KuiperObjectId, Holdout[]>
  const validation = {} as Record<
    KuiperObjectId,
    { maxPositionErrorAu: number; maxAngularErrorDeg: number }
  >
  let startJd = 0
  let sampleCount = 0

  for (const object of KUIPER_OBJECTS) {
    process.stdout.write(`Fetching ${object.number} ${object.name}... `)
    const horizonsId = object.horizonsId ?? object.number
    const majorBody = object.horizonsId !== undefined
    const [rawSamples, holdouts] = await Promise.all([
      fetchStates(horizonsId, object.name, START_TIME, majorBody),
      fetchStates(horizonsId, object.name, HOLDOUT_START_TIME, majorBody),
    ])
    const samples = quantize(rawSamples)
    if (samples.length < 2) throw new Error(`${object.name} has too few samples`)
    for (let index = 1; index < samples.length; index++) {
      if (Math.abs(samples[index].jd - samples[index - 1].jd - STEP_DAYS) > 1e-9) {
        throw new Error(`${object.name} has a nonuniform sample interval`)
      }
    }
    if (startJd && samples[0].jd !== startJd) throw new Error(`${object.name} start mismatch`)
    if (sampleCount && samples.length !== sampleCount)
      throw new Error(`${object.name} count mismatch`)
    startJd = samples[0].jd
    sampleCount = samples.length
    encoded[object.id] = encode(samples)
    checks[object.id] = representativeHoldouts(holdouts)
    validation[object.id] = validate(samples, holdouts)
    console.log(
      `${samples.length} samples, max ${validation[object.id].maxAngularErrorDeg.toFixed(6)}°`,
    )
  }

  const source = `/**
 * Generated by scripts/generate-kuiper-ephemerides.ts from JPL Horizons.
 * Geometric state vectors about the solar-system barycenter (${CENTER}),
 * J2000 ecliptic, AU and AU/day. Do not edit by hand.
 */
import type { KuiperObjectId } from '../kuiperObjects.ts'

export const KUIPER_EPHEMERIS_START_JD = ${startJd}
export const KUIPER_EPHEMERIS_STEP_DAYS = ${STEP_DAYS}
export const KUIPER_EPHEMERIS_SAMPLE_COUNT = ${sampleCount}

/** Packed little-endian Float32 tuples: x, y, z, vx, vy, vz. */
export const KUIPER_EPHEMERIS_BASE64: Record<KuiperObjectId, string> = {
${KUIPER_OBJECTS.map((object) => `  '${object.id}':\n${wrappedString(encoded[object.id])}`).join('\n')}
}

export const KUIPER_EPHEMERIS_HOLDOUTS: Record<
  KuiperObjectId,
  readonly { jd: number; position: readonly [number, number, number] }[]
> = ${JSON.stringify(checks, null, 2)}

export const KUIPER_EPHEMERIS_VALIDATION: Record<
  KuiperObjectId,
  { maxPositionErrorAu: number; maxAngularErrorDeg: number }
> = ${JSON.stringify(validation, null, 2)}
`
  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, source)
  console.log(`Wrote ${OUTPUT}`)
}

await main()
