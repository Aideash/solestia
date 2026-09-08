/**
 * Regenerates Roman boundary and IAU proper-name modules from scripts/data/.
 * Run after updating those source tables:
 *   node --experimental-strip-types --no-warnings scripts/generate-constellation-overlays.ts
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ROMAN_SOURCE = resolve(ROOT, 'scripts/data/roman-boundaries-b1875.json')
const IAU_SOURCE = resolve(ROOT, 'scripts/data/iau-csn.txt')
const CATALOG = resolve(ROOT, 'src/data/generated/constellations.ts')
const ROMAN_OUT = resolve(ROOT, 'src/data/generated/romanBoundaries.ts')
const NAMES_OUT = resolve(ROOT, 'src/data/generated/iauStarNames.ts')

const romanRows = JSON.parse(await readFile(ROMAN_SOURCE, 'utf8')) as [
  number,
  number,
  number,
  string,
][]

await writeFile(
  ROMAN_OUT,
  `/**
 * Generated from Nancy Roman 1987 constellation boundary table (VI/42),
 * equinox B1875.0. Each row is [RA_low_hours, RA_up_hours, DE_low_deg, abbreviation].
 * Source: https://cdsarc.cds.unistra.fr/viz-bin/cat/VI/42
 */
export type RomanBoundaryRow = readonly [raLowHours: number, raUpHours: number, deLowDeg: number, abbreviation: string]

const ROMAN_BOUNDARIES: readonly RomanBoundaryRow[] = ${JSON.stringify(romanRows)} as const

export default ROMAN_BOUNDARIES
`,
)

const catalog = await readFile(CATALOG, 'utf8')
const hipsInCatalog = new Set<number>()
for (const match of catalog.matchAll(/'hip-(\d+)',\s*\n\s*(\d+),/g)) {
  hipsInCatalog.add(Number(match[2]))
}

const iauText = await readFile(IAU_SOURCE, 'utf8')
const names = new Map<number, string>()
for (const line of iauText.split(/\n/)) {
  if (!line || line.startsWith('#')) continue
  const parts = line.trim().split(/\s+/)
  const bandIdx = parts.findIndex((part, index) => (part === 'V' || part === 'G') && index > 5)
  if (bandIdx < 0) continue
  const hipRaw = parts[bandIdx + 1]
  const asciiName = parts[0]
  if (!hipRaw || hipRaw === '_' || !/^\d+$/.test(hipRaw)) continue
  const hip = Number(hipRaw)
  if (!hipsInCatalog.has(hip) || names.has(hip)) continue
  names.set(hip, asciiName)
}

const entries = [...names.entries()].sort((left, right) => left[0] - right[0])
await writeFile(
  NAMES_OUT,
  `/**
 * Generated from the IAU Catalog of Star Names (IAU-CSN / WGSN).
 * Maps Hipparcos HIP numbers present in the constellation catalog to IAU proper names.
 * Source: https://www.iau.org/public/themes/naming_stars/
 * Table: https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt
 */
export const IAU_STAR_PROPER_NAMES: ReadonlyMap<number, string> = new Map([
${entries.map(([hip, name]) => `  [${hip}, ${JSON.stringify(name)}],`).join('\n')}
])
`,
)

console.log(
  `generate-constellation-overlays: ${romanRows.length} Roman boundary rows, ${entries.length} IAU proper names`,
)
