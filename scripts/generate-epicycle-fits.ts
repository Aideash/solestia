import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { MOONS } from '../src/data/moons.ts'
import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS, type PlanetId } from '../src/data/planets.ts'
import { planetSystemAt, solarSystemAt, wrapRadSigned } from '../src/lib/kepler.ts'

type Complex = { re: number; im: number }
type Sample = { days: number; direction: Complex }
type Circle = { radius: number; phaseRad: number; rateRadPerDay: number }
type Fit = {
  depth: number
  fromMs: number
  toMs: number
  eccentricity: number
  apsisRad: number
  apsisRateRadPerDay: number
  circles: Circle[]
  rmsErrorDeg: number
  maxErrorDeg: number
}

const IDS = ['moon', 'mercury', 'venus', 'sun', 'mars', 'jupiter', 'saturn'] as const
type BodyId = (typeof IDS)[number]
const J2000_MS = Date.parse('2000-01-01T12:00:00Z')
const TAU = Math.PI * 2
const RAD_TO_DEG = 180 / Math.PI
const MS_PER_DAY = 86_400_000
const SAMPLE_STEP_DAYS = 2

function solve(matrix: number[][], values: number[]): number[] {
  const n = values.length
  const augmented = matrix.map((row, index) => [...row, values[index]])

  for (let column = 0; column < n; column++) {
    let pivot = column
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    if (Math.abs(divisor) < 1e-12) throw new Error('Epicycle fit matrix is singular')

    for (let entry = column; entry <= n; entry++) augmented[column][entry] /= divisor
    for (let row = 0; row < n; row++) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let entry = column; entry <= n; entry++) {
        augmented[row][entry] -= factor * augmented[column][entry]
      }
    }
  }

  return augmented.map((row) => row[n])
}

function fitCoefficients(samples: Sample[], rates: number[]): Complex[] {
  const size = rates.length * 2
  const normal = Array.from({ length: size }, () => Array<number>(size).fill(0))
  const target = Array<number>(size).fill(0)

  for (const sample of samples) {
    const rows = [
      rates.flatMap((rate) => [Math.cos(rate * sample.days), -Math.sin(rate * sample.days)]),
      rates.flatMap((rate) => [Math.sin(rate * sample.days), Math.cos(rate * sample.days)]),
    ]
    const values = [sample.direction.re, sample.direction.im]

    for (let observation = 0; observation < 2; observation++) {
      for (let i = 0; i < size; i++) {
        target[i] += rows[observation][i] * values[observation]
        for (let j = 0; j < size; j++) {
          normal[i][j] += rows[observation][i] * rows[observation][j]
        }
      }
    }
  }

  const solution = solve(normal, target)
  return rates.map((_, index) => ({ re: solution[index * 2], im: solution[index * 2 + 1] }))
}

type ModelParameters = {
  eccentricity: number
  apsisRad: number
  apsisRateRadPerDay: number
  circles: Circle[]
}

function modelPoint(days: number, parameters: ModelParameters): Complex {
  const primary = parameters.circles[0]
  const apsisRad = parameters.apsisRad + parameters.apsisRateRadPerDay * days
  const center = {
    re: parameters.eccentricity * Math.cos(apsisRad),
    im: parameters.eccentricity * Math.sin(apsisRad),
  }
  const equant = { re: center.re * 2, im: center.im * 2 }
  const meanAngle = primary.phaseRad + primary.rateRadPerDay * days
  const direction = { re: Math.cos(meanAngle), im: Math.sin(meanAngle) }
  const dx = equant.re - center.re
  const dy = equant.im - center.im
  const along = direction.re * dx + direction.im * dy
  const rayDistance = -along + Math.sqrt(Math.max(0, along * along + 1 - dx * dx - dy * dy))
  const point = {
    re: equant.re + rayDistance * direction.re,
    im: equant.im + rayDistance * direction.im,
  }
  for (const circle of parameters.circles.slice(1)) {
    const angle = circle.phaseRad + circle.rateRadPerDay * days
    point.re += circle.radius * Math.cos(angle)
    point.im += circle.radius * Math.sin(angle)
  }
  return point
}

function metrics(samples: Sample[], parameters: ModelParameters) {
  const errors = samples.map((sample) => {
    const model = modelPoint(sample.days, parameters)
    return wrapRadSigned(
      Math.atan2(model.im, model.re) - Math.atan2(sample.direction.im, sample.direction.re),
    )
  })
  return {
    rmsErrorDeg:
      Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length) * RAD_TO_DEG,
    maxErrorDeg: Math.max(...errors.map(Math.abs)) * RAD_TO_DEG,
  }
}

function directionAt(id: BodyId, at: Date): Complex {
  if (id === 'moon') {
    const earthSystem = planetSystemAt(at, 'earth')
    const moon = earthSystem.satellites.find((satellite) => satellite.id === 'moon')
    if (!moon) throw new Error('Missing Moon')
    const x = moon.position.x - earthSystem.parent.position.x
    const y = moon.position.y - earthSystem.parent.position.y
    const length = Math.hypot(x, y)
    return { re: x / length, im: y / length }
  }

  const snapshot = solarSystemAt(at)
  const earth = snapshot.planets.find((planet) => planet.id === 'earth')
  if (!earth) throw new Error('Missing Earth')
  if (id === 'sun') {
    const length = Math.hypot(earth.position.x, earth.position.y)
    return { re: -earth.position.x / length, im: -earth.position.y / length }
  }
  const planet = snapshot.planets.find((body) => body.id === (id as PlanetId))
  if (!planet) throw new Error(`Missing ${id}`)
  const x = planet.position.x - earth.position.x
  const y = planet.position.y - earth.position.y
  const length = Math.hypot(x, y)
  return { re: x / length, im: y / length }
}

function makeSamples(id: BodyId): {
  fromMs: number
  toMs: number
  samples: Sample[]
} {
  const fromMs = ELEMENTS_VALID_FROM_MS
  const toMs = ELEMENTS_VALID_TO_MS
  const stepMs = SAMPLE_STEP_DAYS * MS_PER_DAY
  const sampleTimes: number[] = []
  for (let atMs = fromMs; atMs < toMs; atMs += stepMs) sampleTimes.push(atMs)
  sampleTimes.push(toMs)
  const samples = sampleTimes.map((atMs) => {
    return {
      days: (atMs - J2000_MS) / MS_PER_DAY,
      direction: directionAt(id, new Date(atMs)),
    }
  })
  return { fromMs, toMs, samples }
}

function initialParameters(samples: Sample[], rates: number[]): ModelParameters {
  const coefficients = fitCoefficients(samples, rates)
  const primaryRadius = Math.max(Math.hypot(coefficients[0].re, coefficients[0].im), 1e-6)
  return {
    eccentricity: 0.1,
    apsisRad: 0,
    apsisRateRadPerDay: 0,
    circles: coefficients.map((coefficient, index) => ({
      radius:
        index === 0
          ? 1
          : Math.min(
              0.95,
              Math.max(0.002, Math.hypot(coefficient.re, coefficient.im) / primaryRadius),
            ),
      phaseRad: Math.atan2(coefficient.im, coefficient.re),
      rateRadPerDay: rates[index],
    })),
  }
}

function parameterVector(parameters: ModelParameters): number[] {
  return [
    parameters.eccentricity,
    parameters.apsisRad,
    parameters.circles[0].phaseRad,
    ...parameters.circles.slice(1).flatMap((circle) => [circle.radius, circle.phaseRad]),
  ]
}

function parametersFromVector(
  vector: number[],
  rates: number[],
  apsisRateRadPerDay: number,
): ModelParameters {
  return {
    eccentricity: vector[0],
    apsisRad: vector[1],
    apsisRateRadPerDay,
    circles: rates.map((rate, index) => ({
      radius: index === 0 ? 1 : vector[1 + index * 2],
      phaseRad: vector[2 + index * 2],
      rateRadPerDay: rate,
    })),
  }
}

function angularRms(
  samples: Sample[],
  vector: number[],
  rates: number[],
  apsisRateRadPerDay: number,
): number {
  const parameters = parametersFromVector(vector, rates, apsisRateRadPerDay)
  let squaredError = 0
  for (const sample of samples) {
    const model = modelPoint(sample.days, parameters)
    const error = wrapRadSigned(
      Math.atan2(model.im, model.re) - Math.atan2(sample.direction.im, sample.direction.re),
    )
    squaredError += error * error
  }
  return Math.sqrt(squaredError / samples.length)
}

function optimize(
  samples: Sample[],
  rates: number[],
  seed: ModelParameters,
  broadApsisSearch = false,
): ModelParameters {
  const seedVector = parameterVector(seed)
  const starts = broadApsisSearch
    ? [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((apsisRad) => {
        const vector = [...seedVector]
        vector[0] = 0.1
        vector[1] = apsisRad
        return vector
      })
    : [seedVector]
  let globalBest = starts[0]
  let globalScore = Number.POSITIVE_INFINITY

  for (const start of starts) {
    let vector = [...start]
    let score = angularRms(samples, vector, rates, seed.apsisRateRadPerDay)
    let steps = vector.map((_, index) => {
      if (index === 0) return 0.04
      if (index === 1 || index === 2 || index % 2 === 0) return 0.2
      return 0.08
    })

    for (let level = 0; level < 12; level++) {
      for (let pass = 0; pass < 8; pass++) {
        let changed = false
        for (let index = 0; index < vector.length; index++) {
          let bestAtIndex = vector
          let bestAtIndexScore = score
          for (const sign of [-1, 1]) {
            const candidate = [...vector]
            candidate[index] += sign * steps[index]
            const isRadius = index === 0 || (index >= 3 && index % 2 === 1)
            if (
              (index === 0 && (candidate[index] < 0 || candidate[index] >= 0.5)) ||
              (isRadius && index !== 0 && (candidate[index] < 0.001 || candidate[index] >= 1))
            ) {
              continue
            }
            const candidateScore = angularRms(samples, candidate, rates, seed.apsisRateRadPerDay)
            if (candidateScore < bestAtIndexScore) {
              bestAtIndex = candidate
              bestAtIndexScore = candidateScore
            }
          }
          if (bestAtIndex !== vector) {
            vector = bestAtIndex
            score = bestAtIndexScore
            changed = true
          }
        }
        if (!changed) break
      }
      steps = steps.map((step) => step / 2)
    }

    if (score < globalScore) {
      globalBest = vector
      globalScore = score
    }
  }
  return parametersFromVector(globalBest, rates, seed.apsisRateRadPerDay)
}

function extendParameters(
  parameters: ModelParameters,
  rate: number,
  samples: Sample[],
): ModelParameters {
  const coefficients = fitCoefficients(samples, [
    ...parameters.circles.map((circle) => circle.rateRadPerDay),
    rate,
  ])
  const primaryRadius = Math.max(Math.hypot(coefficients[0].re, coefficients[0].im), 1e-6)
  const coefficient = coefficients.at(-1)!
  return {
    eccentricity: parameters.eccentricity,
    apsisRad: parameters.apsisRad,
    apsisRateRadPerDay: parameters.apsisRateRadPerDay,
    circles: [
      ...parameters.circles,
      {
        radius: Math.min(
          0.25,
          Math.max(0.002, Math.hypot(coefficient.re, coefficient.im) / primaryRadius),
        ),
        phaseRad: Math.atan2(coefficient.im, coefficient.re),
        rateRadPerDay: rate,
      },
    ],
  }
}

function fitResidualCircle(
  parameters: ModelParameters,
  rate: number,
  samples: Sample[],
): ModelParameters {
  let aa = 0
  let ab = 0
  let bb = 0
  let ay = 0
  let by = 0
  for (const sample of samples) {
    const model = modelPoint(sample.days, parameters)
    const squaredDistance = model.re * model.re + model.im * model.im
    const angle = rate * sample.days
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const cosineResponse = (sin * model.re - cos * model.im) / squaredDistance
    const sineResponse = (cos * model.re + sin * model.im) / squaredDistance
    const error = wrapRadSigned(
      Math.atan2(model.im, model.re) - Math.atan2(sample.direction.im, sample.direction.re),
    )
    aa += cosineResponse * cosineResponse
    ab += cosineResponse * sineResponse
    bb += sineResponse * sineResponse
    ay -= cosineResponse * error
    by -= sineResponse * error
  }
  const [cosineCoefficient, sineCoefficient] = solve(
    [
      [aa, ab],
      [ab, bb],
    ],
    [ay, by],
  )
  return {
    eccentricity: parameters.eccentricity,
    apsisRad: parameters.apsisRad,
    apsisRateRadPerDay: parameters.apsisRateRadPerDay,
    circles: [
      ...parameters.circles,
      {
        radius: Math.hypot(cosineCoefficient, sineCoefficient),
        phaseRad: Math.atan2(sineCoefficient, cosineCoefficient),
        rateRadPerDay: rate,
      },
    ],
  }
}

function finishFit(
  parameters: ModelParameters,
  samples: Sample[],
): Pick<
  Fit,
  'eccentricity' | 'apsisRad' | 'apsisRateRadPerDay' | 'circles' | 'rmsErrorDeg' | 'maxErrorDeg'
> {
  const radiusSum = parameters.circles.reduce((sum, circle) => sum + circle.radius, 0)
  const circles = [
    parameters.circles[0],
    ...parameters.circles.slice(1).sort((a, b) => b.radius - a.radius),
  ].map((circle) => ({ ...circle, radius: circle.radius / radiusSum }))
  return {
    eccentricity: parameters.eccentricity,
    apsisRad: wrapRadSigned(parameters.apsisRad),
    apsisRateRadPerDay: parameters.apsisRateRadPerDay,
    circles,
    ...metrics(samples, parameters),
  }
}

function uniqueRates(rates: number[]): number[] {
  return rates.filter(
    (rate, index) =>
      Math.abs(rate) > 1e-9 &&
      rates.findIndex((candidate) => Math.abs(candidate - rate) < 1e-12) === index,
  )
}

function fitBody(id: BodyId): Fit[] {
  const snapshot = solarSystemAt(new Date(J2000_MS))
  const earth = snapshot.planets.find((body) => body.id === 'earth')
  if (!earth) throw new Error('Missing Earth period')
  const earthRate = TAU / earth.siderealOrbitDays
  let fundamentals: number[]
  let remaining: number[]
  let apsisRateRadPerDay = 0

  if (id === 'sun') {
    fundamentals = [earthRate]
    remaining = [2 * earthRate, 3 * earthRate, 4 * earthRate, 5 * earthRate]
  } else if (id === 'moon') {
    const moon = planetSystemAt(new Date(J2000_MS), 'earth').satellites.find(
      (satellite) => satellite.id === 'moon',
    )
    const moonData = MOONS.find((satellite) => satellite.id === 'moon')
    if (!moon || !moonData) throw new Error('Missing Moon period')
    const moonRate = TAU / moon.siderealOrbitDays
    apsisRateRadPerDay =
      (TAU * moonData.elements.apsisDirection) / (moonData.elements.periapsisPeriodYears * 365.25) +
      (TAU * moonData.elements.nodeDirection) / (moonData.elements.nodePeriodYears * 365.25)
    const anomalisticRate = moonRate - apsisRateRadPerDay
    fundamentals = [moonRate]
    remaining = [
      2 * moonRate - 2 * earthRate + apsisRateRadPerDay,
      3 * moonRate - 2 * earthRate,
      3 * moonRate - 2 * apsisRateRadPerDay,
      moonRate + earthRate,
      moonRate + 2 * earthRate,
      2 * moonRate - anomalisticRate,
    ]
  } else {
    const planet = snapshot.planets.find((body) => body.id === id)
    if (!planet) throw new Error(`Missing period for ${id}`)
    const planetRate = TAU / planet.siderealOrbitDays
    fundamentals = [planetRate, earthRate]
    remaining = [
      2 * planetRate - earthRate,
      2 * earthRate - planetRate,
      3 * planetRate - 2 * earthRate,
      3 * earthRate - 2 * planetRate,
      2 * planetRate,
      2 * earthRate,
    ]
  }

  remaining = uniqueRates(remaining)
  const { fromMs, toMs, samples } = makeSamples(id)
  const optimizationSamples = samples.filter((_, index) => index % (id === 'moon' ? 2 : 10) === 0)
  const firstCandidates = fundamentals.map((rate) => {
    const rates = [rate]
    const seed = initialParameters(optimizationSamples, rates)
    seed.apsisRateRadPerDay = apsisRateRadPerDay
    const parameters = optimize(optimizationSamples, rates, seed, true)
    return { rates, parameters, score: metrics(optimizationSamples, parameters).rmsErrorDeg }
  })
  firstCandidates.sort((a, b) => a.score - b.score)

  const chosen = [...firstCandidates[0].rates]
  let parameters = firstCandidates[0].parameters
  const fits: Fit[] = [{ depth: 1, fromMs, toMs, ...finishFit(parameters, samples) }]
  const requiredSecond = fundamentals.find((rate) => rate !== chosen[0])
  if (requiredSecond !== undefined) {
    chosen.push(requiredSecond)
    parameters = optimize(
      optimizationSamples,
      chosen,
      extendParameters(parameters, requiredSecond, optimizationSamples),
      true,
    )
    fits.push({ depth: 2, fromMs, toMs, ...finishFit(parameters, samples) })
  }

  while (chosen.length < 4) {
    const previousParameters = parameters
    const candidates = remaining.map((rate) => {
      const rates = [...chosen, rate]
      const candidateParameters = optimize(
        optimizationSamples,
        rates,
        extendParameters(parameters, rate, optimizationSamples),
      )
      const residualParameters = fitResidualCircle(previousParameters, rate, samples)
      const bestParameters =
        metrics(samples, candidateParameters).rmsErrorDeg <
        metrics(samples, residualParameters).rmsErrorDeg
          ? candidateParameters
          : residualParameters
      return {
        rate,
        parameters: bestParameters,
        score: metrics(samples, bestParameters).rmsErrorDeg,
      }
    })
    candidates.sort((a, b) => a.score - b.score)
    const best = candidates[0]
    chosen.push(best.rate)
    remaining.splice(remaining.indexOf(best.rate), 1)
    const proposedFit = finishFit(best.parameters, samples)
    if (proposedFit.rmsErrorDeg <= fits.at(-1)!.rmsErrorDeg) {
      parameters = best.parameters
      fits.push({ depth: chosen.length, fromMs, toMs, ...proposedFit })
    } else {
      parameters = fitResidualCircle(previousParameters, best.rate, samples)
      fits.push({ depth: chosen.length, fromMs, toMs, ...finishFit(parameters, samples) })
    }
  }
  return fits
}

function number(value: number): string {
  if (Number.isInteger(value)) return value.toString()
  return Number(value.toPrecision(12)).toString()
}

function serialize(fits: Record<(typeof IDS)[number], Fit[]>): string {
  const body = IDS.map((id) => {
    const depths = fits[id]
      .map(
        (fit) => `    {
      depth: ${fit.depth},
      fromMs: ${number(fit.fromMs)},
      toMs: ${number(fit.toMs)},
      eccentricity: ${number(fit.eccentricity)},
      apsisRad: ${number(fit.apsisRad)},
      apsisRateRadPerDay: ${number(fit.apsisRateRadPerDay)},
      rmsErrorDeg: ${number(fit.rmsErrorDeg)},
      maxErrorDeg: ${number(fit.maxErrorDeg)},
      circles: [
${fit.circles
  .map(
    (circle) =>
      `        { radius: ${number(circle.radius)}, phaseRad: ${number(circle.phaseRad)}, rateRadPerDay: ${number(circle.rateRadPerDay)} },`,
  )
  .join('\n')}
      ],
    }`,
      )
      .join(',\n')
    return `  ${id}: [\n${depths},\n  ]`
  }).join(',\n')

  return `// Generated by scripts/generate-epicycle-fits.ts. Do not edit by hand.
import type { EpicycleFitCatalog } from '../../lib/epicycles.types.ts'

export const EPICYCLE_PLANET_IDS = ${JSON.stringify(IDS)} as const

export const EPICYCLE_FITS: EpicycleFitCatalog = {
${body},
}
`
}

const catalog = Object.fromEntries(IDS.map((id) => [id, fitBody(id)])) as Record<
  (typeof IDS)[number],
  Fit[]
>
const outputUrl = new URL('../src/data/generated/epicycleFits.ts', import.meta.url)
await writeFile(fileURLToPath(outputUrl), serialize(catalog))

for (const id of IDS) {
  const errors = catalog[id].map((fit) => fit.rmsErrorDeg.toFixed(3)).join('° → ')
  console.log(`${id}: ${errors}°`)
}
