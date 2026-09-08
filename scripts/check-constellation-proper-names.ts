import { CONSTELLATION_STARS } from '../src/data/constellations.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const byHip = (hip: number) => CONSTELLATION_STARS.find((star) => star.hip === hip)

const betelgeuse = byHip(27989)
assert(betelgeuse, 'Betelgeuse (HIP 27989) must be in the catalog')
assert(betelgeuse.properName === 'Betelgeuse', `expected Betelgeuse, got ${betelgeuse.properName}`)

const rigel = byHip(24436)
assert(rigel?.properName === 'Rigel', `expected Rigel, got ${rigel?.properName}`)

const sirius = byHip(32349)
assert(sirius?.properName === 'Sirius', `expected Sirius, got ${sirius?.properName}`)

const named = CONSTELLATION_STARS.filter((star) => star.properName !== null)
assert(named.length >= 200, `expected hundreds of IAU names in catalog, got ${named.length}`)
assert(
  named.every((star) => typeof star.properName === 'string' && star.properName.length > 0),
  'proper names must be non-empty strings',
)
assert(
  !CONSTELLATION_STARS.some((star) => star.properName === 'WASP-82'),
  'catalog designations must not be treated as proper names',
)

console.log(`check-constellation-proper-names: ok (${named.length} named stars)`)
