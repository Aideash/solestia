import {
  CONSTELLATION_ATTRIBUTIONS,
  CONSTELLATION_CATALOG_META,
  CONSTELLATIONS,
  CONSTELLATION_LANDMARKS,
  CONSTELLATION_STARS,
  constellationById,
  normalizeConstellationSearch,
  searchConstellations,
} from '../src/data/constellations.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(CONSTELLATIONS.length === 88, `expected 88 constellations, got ${CONSTELLATIONS.length}`)
assert(
  new Set(CONSTELLATIONS.map(({ id }) => id)).size === 88,
  'constellation route IDs must be unique',
)
const canonicalIdentifiers =
  'andromeda:And antlia:Ant apus:Aps aquarius:Aqr aquila:Aql ara:Ara aries:Ari auriga:Aur bootes:Boo caelum:Cae camelopardalis:Cam cancer:Cnc canes-venatici:CVn canis-major:CMa canis-minor:CMi capricornus:Cap carina:Car cassiopeia:Cas centaurus:Cen cepheus:Cep cetus:Cet chamaeleon:Cha circinus:Cir columba:Col coma-berenices:Com corona-australis:CrA corona-borealis:CrB corvus:Crv crater:Crt crux:Cru cygnus:Cyg delphinus:Del dorado:Dor draco:Dra equuleus:Equ eridanus:Eri fornax:For gemini:Gem grus:Gru hercules:Her horologium:Hor hydra:Hya hydrus:Hyi indus:Ind lacerta:Lac leo:Leo leo-minor:LMi lepus:Lep libra:Lib lupus:Lup lynx:Lyn lyra:Lyr mensa:Men microscopium:Mic monoceros:Mon musca:Mus norma:Nor octans:Oct ophiuchus:Oph orion:Ori pavo:Pav pegasus:Peg perseus:Per phoenix:Phe pictor:Pic pisces:Psc piscis-austrinus:PsA puppis:Pup pyxis:Pyx reticulum:Ret sagitta:Sge sagittarius:Sgr scorpius:Sco sculptor:Scl scutum:Sct serpens:Ser sextans:Sex taurus:Tau telescopium:Tel triangulum:Tri triangulum-australe:TrA tucana:Tuc ursa-major:UMa ursa-minor:UMi vela:Vel virgo:Vir volans:Vol vulpecula:Vul'
assert(
  CONSTELLATIONS.map(({ id, abbreviation }) => `${id}:${abbreviation}`).join(' ') ===
    canonicalIdentifiers,
  'catalog must contain the canonical 88 route IDs and IAU abbreviations in name order',
)
assert(
  CONSTELLATIONS.filter(({ edges }) => edges.length === 0)
    .map(({ id }) => id)
    .join(',') === 'mensa,microscopium',
  'only the explicitly allowlisted IAU figures may be empty',
)
assert(
  normalizeConstellationSearch('  Boötes—The Herdsman ') === 'bootes the herdsman',
  'search normalization must fold accents, punctuation, and repeated whitespace',
)
assert(
  constellationById('ursa-major')?.name === 'Ursa Major',
  'route lookup must resolve exact IDs',
)
assert(constellationById('Ursa-Major') === undefined, 'route lookup must remain case-sensitive')
assert(
  searchConstellations('great bear')[0]?.id === 'ursa-major',
  'search must match useful aliases',
)
assert(searchConstellations('UMa')[0]?.id === 'ursa-major', 'search must match IAU abbreviations')
assert(searchConstellations('bootes')[0]?.id === 'bootes', 'search must match normalized names')
assert(searchConstellations('plow')[0]?.id === 'ursa-major', 'search must use American aliases')
assert(searchConstellations('plough').length === 0, 'search must not expose British-only aliases')
assert(
  searchConstellations('')[0]?.id === 'andromeda',
  'empty search must return the full name-sorted list',
)
assert(
  searchConstellations('not a constellation').length === 0,
  'unknown search must return no matches',
)

const starIds = new Set(CONSTELLATION_STARS.map(({ id }) => id))
assert(starIds.size === CONSTELLATION_STARS.length, 'star IDs must be unique')
for (const constellation of CONSTELLATIONS) {
  for (const edge of constellation.edges) {
    assert(
      starIds.has(edge[0]) && starIds.has(edge[1]),
      `${constellation.name} has an unresolved figure edge`,
    )
  }
}
assert(
  CONSTELLATION_LANDMARKS.some(({ name }) => name === 'Orion Nebula'),
  'Milky Way landmarks must include the Orion Nebula',
)
assert(
  CONSTELLATION_LANDMARKS.every(({ galaxy }) => galaxy === 'Milky Way'),
  'landmark catalog must exclude extragalactic objects',
)
assert(
  CONSTELLATION_ATTRIBUTIONS.some(
    ({ license, sourceUrl, revision }) =>
      license === 'CC BY 4.0' &&
      sourceUrl ===
        'https://raw.githubusercontent.com/dcf21/constellation-stick-figures/75d29c207bbd752023c447ddd1f9f4ff0eb47538/constellation_lines_iau.dat' &&
      revision === '75d29c207bbd752023c447ddd1f9f4ff0eb47538',
  ),
  'UI attribution must preserve the pinned constellation-line URL and revision',
)
assert(
  CONSTELLATION_CATALOG_META.contextMagnitudeLimit === 6 &&
    CONSTELLATION_CATALOG_META.contextMagnitudeBand === 'Johnson V' &&
    CONSTELLATION_CATALOG_META.contextMagnitudeSource === 'Hipparcos',
  'catalog metadata must identify the context-star selection band and source',
)
const expectedSourceSections =
  'Andromeda Antlia Apus Aquarius Aquila Ara Aries Auriga Bootes Caelum Camelopardalis Cancer CanesVenatici CanisMajor CanisMinor Capricornus Carina Cassiopeia Centaurus Cepheus Cetus Chamaeleon Circinus Columba ComaBerenices CoronaAustralis CoronaBorealis Corvus Crater Crux Cygnus Delphinus Dorado Draco Equuleus Eridanus Fornax Gemini Grus Hercules Horologium Hydra Hydrus Indus Lacerta Leo LeoMinor Lepus Libra Lupus Lynx Lyra Mensa Microscopium Monoceros Musca Norma Octans Ophiuchus Orion Pavo Pegasus Perseus Phoenix Pictor Pisces PiscisAustrinus Puppis Pyxis Reticulum Sagitta Sagittarius Scorpius Sculptor Scutum SerpensA SerpensB Sextans Taurus Telescopium Triangulum TriangulumAustrale Tucana UrsaMajor UrsaMinor Vela Virgo Volans Vulpecula'
assert(
  CONSTELLATION_CATALOG_META.lineSourceSections.join(' ') === expectedSourceSections,
  'catalog metadata must prove every expected line-source section was consumed',
)
assert(
  CONSTELLATION_CATALOG_META.emptyFigureIds.join(',') === 'mensa,microscopium',
  'catalog metadata must expose the exact empty-figure allowlist',
)

for (const star of CONSTELLATION_STARS) {
  assert(
    Number.isFinite(star.raDeg) && Number.isFinite(star.decDeg),
    `${star.id} coordinates invalid`,
  )
  assert(
    star.constellationIds.length > 0 ||
      (star.selectionMagnitudeV !== null &&
        star.selectionMagnitudeV <= CONSTELLATION_CATALOG_META.contextMagnitudeLimit),
    `${star.id} is neither a figure star nor inside the documented Johnson V cutoff`,
  )
  assert(
    star.distanceLy === null ||
      (star.distanceLy > 0 &&
        star.distanceLy <= 100_000 &&
        star.distanceErrorLy !== null &&
        star.distanceQuality !== 'unavailable' &&
        star.distanceSource !== null),
    `${star.id} distance metadata is inconsistent or beyond the Milky Way`,
  )
  assert(
    star.velocityKmS === null ||
      (star.pmRaMasYr !== null &&
        star.pmDecMasYr !== null &&
        star.radialVelocityKmS !== null &&
        star.distanceLy !== null &&
        star.velocityKmS.every(Number.isFinite)),
    `${star.id} velocity must only exist from complete measurements`,
  )
}

console.log(
  `ok  constellation catalog: ${CONSTELLATIONS.length} constellations, ${CONSTELLATION_STARS.length} stars, ${CONSTELLATION_LANDMARKS.length} Milky Way landmarks`,
)
