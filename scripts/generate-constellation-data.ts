import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const LINE_SOURCE_REVISION = '75d29c207bbd752023c447ddd1f9f4ff0eb47538'
const LINE_SOURCE_URL = `https://raw.githubusercontent.com/dcf21/constellation-stick-figures/${LINE_SOURCE_REVISION}/constellation_lines_iau.dat`
const LINE_SOURCE_PAGE = 'https://github.com/dcf21/constellation-stick-figures'
const HIPPARCOS_URL =
  'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=I%2F239%2Fhip_main&-out=HIP%2CRAICRS%2CDEICRS%2CVmag%2CPlx%2Ce_Plx%2CpmRA%2CpmDE%2CSpType&Vmag=%3C6.5&-out.max=10000'
const HIPPARCOS_PAGE = 'https://cdsarc.cds.unistra.fr/viz-bin/cat/I/239'
const GAIA_TAP_URL = 'https://gea.esac.esa.int/tap-server/tap/sync'
const GAIA_PAGE = 'https://gea.esac.esa.int/archive/'
const OUTPUT = resolve('src/data/generated/constellations.ts')
const CONTEXT_MAGNITUDE_LIMIT = 6
const PARSEC_TO_LIGHT_YEARS = 3.261563777
const TANGENTIAL_VELOCITY_FACTOR = 4.74047

type ConstellationDefinition = {
  abbreviation: string
  name: string
  aliases: string[]
  sourceKeys?: string[]
}

const DEFINITIONS: ConstellationDefinition[] = [
  { abbreviation: 'And', name: 'Andromeda', aliases: ['Chained Maiden'] },
  { abbreviation: 'Ant', name: 'Antlia', aliases: ['Air Pump'] },
  { abbreviation: 'Aps', name: 'Apus', aliases: ['Bird of Paradise'] },
  { abbreviation: 'Aqr', name: 'Aquarius', aliases: ['Water Bearer'] },
  { abbreviation: 'Aql', name: 'Aquila', aliases: ['Eagle'] },
  { abbreviation: 'Ara', name: 'Ara', aliases: ['Altar'] },
  { abbreviation: 'Ari', name: 'Aries', aliases: ['Ram'] },
  { abbreviation: 'Aur', name: 'Auriga', aliases: ['Charioteer'] },
  { abbreviation: 'Boo', name: 'Boötes', aliases: ['Bootes', 'Herdsman'], sourceKeys: ['Bootes'] },
  { abbreviation: 'Cae', name: 'Caelum', aliases: ['Chisel'] },
  { abbreviation: 'Cam', name: 'Camelopardalis', aliases: ['Giraffe'] },
  { abbreviation: 'Cnc', name: 'Cancer', aliases: ['Crab'] },
  { abbreviation: 'CVn', name: 'Canes Venatici', aliases: ['Hunting Dogs'] },
  { abbreviation: 'CMa', name: 'Canis Major', aliases: ['Great Dog', 'Greater Dog'] },
  { abbreviation: 'CMi', name: 'Canis Minor', aliases: ['Little Dog', 'Lesser Dog'] },
  { abbreviation: 'Cap', name: 'Capricornus', aliases: ['Capricorn', 'Sea Goat'] },
  { abbreviation: 'Car', name: 'Carina', aliases: ['Keel'] },
  { abbreviation: 'Cas', name: 'Cassiopeia', aliases: ['Seated Queen'] },
  { abbreviation: 'Cen', name: 'Centaurus', aliases: ['Centaur'] },
  { abbreviation: 'Cep', name: 'Cepheus', aliases: ['King'] },
  { abbreviation: 'Cet', name: 'Cetus', aliases: ['Sea Monster', 'Whale'] },
  { abbreviation: 'Cha', name: 'Chamaeleon', aliases: ['Chameleon'] },
  { abbreviation: 'Cir', name: 'Circinus', aliases: ['Compass'] },
  { abbreviation: 'Col', name: 'Columba', aliases: ['Dove'] },
  { abbreviation: 'Com', name: 'Coma Berenices', aliases: ["Berenice's Hair"] },
  { abbreviation: 'CrA', name: 'Corona Australis', aliases: ['Southern Crown'] },
  { abbreviation: 'CrB', name: 'Corona Borealis', aliases: ['Northern Crown'] },
  { abbreviation: 'Crv', name: 'Corvus', aliases: ['Crow'] },
  { abbreviation: 'Crt', name: 'Crater', aliases: ['Cup'] },
  { abbreviation: 'Cru', name: 'Crux', aliases: ['Southern Cross'] },
  { abbreviation: 'Cyg', name: 'Cygnus', aliases: ['Swan', 'Northern Cross'] },
  { abbreviation: 'Del', name: 'Delphinus', aliases: ['Dolphin'] },
  { abbreviation: 'Dor', name: 'Dorado', aliases: ['Dolphinfish', 'Swordfish'] },
  { abbreviation: 'Dra', name: 'Draco', aliases: ['Dragon'] },
  { abbreviation: 'Equ', name: 'Equuleus', aliases: ['Little Horse'] },
  { abbreviation: 'Eri', name: 'Eridanus', aliases: ['River'] },
  { abbreviation: 'For', name: 'Fornax', aliases: ['Furnace'] },
  { abbreviation: 'Gem', name: 'Gemini', aliases: ['Twins'] },
  { abbreviation: 'Gru', name: 'Grus', aliases: ['Crane'] },
  { abbreviation: 'Her', name: 'Hercules', aliases: ['Strongman'] },
  { abbreviation: 'Hor', name: 'Horologium', aliases: ['Clock'] },
  { abbreviation: 'Hya', name: 'Hydra', aliases: ['Water Snake', 'Female Water Snake'] },
  { abbreviation: 'Hyi', name: 'Hydrus', aliases: ['Male Water Snake'] },
  { abbreviation: 'Ind', name: 'Indus', aliases: ['Indian'] },
  { abbreviation: 'Lac', name: 'Lacerta', aliases: ['Lizard'] },
  { abbreviation: 'Leo', name: 'Leo', aliases: ['Lion'] },
  { abbreviation: 'LMi', name: 'Leo Minor', aliases: ['Little Lion'] },
  { abbreviation: 'Lep', name: 'Lepus', aliases: ['Hare'] },
  { abbreviation: 'Lib', name: 'Libra', aliases: ['Scales'] },
  { abbreviation: 'Lup', name: 'Lupus', aliases: ['Wolf'] },
  { abbreviation: 'Lyn', name: 'Lynx', aliases: [] },
  { abbreviation: 'Lyr', name: 'Lyra', aliases: ['Lyre', 'Harp'] },
  { abbreviation: 'Men', name: 'Mensa', aliases: ['Table Mountain'] },
  { abbreviation: 'Mic', name: 'Microscopium', aliases: ['Microscope'] },
  { abbreviation: 'Mon', name: 'Monoceros', aliases: ['Unicorn'] },
  { abbreviation: 'Mus', name: 'Musca', aliases: ['Fly'] },
  { abbreviation: 'Nor', name: 'Norma', aliases: ['Level', "Carpenter's Square"] },
  { abbreviation: 'Oct', name: 'Octans', aliases: ['Octant'] },
  { abbreviation: 'Oph', name: 'Ophiuchus', aliases: ['Serpent Bearer'] },
  { abbreviation: 'Ori', name: 'Orion', aliases: ['Hunter'] },
  { abbreviation: 'Pav', name: 'Pavo', aliases: ['Peacock'] },
  { abbreviation: 'Peg', name: 'Pegasus', aliases: ['Winged Horse'] },
  { abbreviation: 'Per', name: 'Perseus', aliases: ['Hero'] },
  { abbreviation: 'Phe', name: 'Phoenix', aliases: ['Firebird'] },
  { abbreviation: 'Pic', name: 'Pictor', aliases: ["Painter's Easel"] },
  { abbreviation: 'Psc', name: 'Pisces', aliases: ['Fishes'] },
  { abbreviation: 'PsA', name: 'Piscis Austrinus', aliases: ['Southern Fish'] },
  { abbreviation: 'Pup', name: 'Puppis', aliases: ['Stern'] },
  { abbreviation: 'Pyx', name: 'Pyxis', aliases: ["Mariner's Compass"] },
  { abbreviation: 'Ret', name: 'Reticulum', aliases: ['Reticle'] },
  { abbreviation: 'Sge', name: 'Sagitta', aliases: ['Arrow'] },
  { abbreviation: 'Sgr', name: 'Sagittarius', aliases: ['Archer', 'Teapot'] },
  { abbreviation: 'Sco', name: 'Scorpius', aliases: ['Scorpio', 'Scorpion'] },
  { abbreviation: 'Scl', name: 'Sculptor', aliases: ["Sculptor's Studio"] },
  { abbreviation: 'Sct', name: 'Scutum', aliases: ['Shield'] },
  {
    abbreviation: 'Ser',
    name: 'Serpens',
    aliases: ['Serpent', 'Serpens Caput', 'Serpens Cauda'],
    sourceKeys: ['SerpensA', 'SerpensB'],
  },
  { abbreviation: 'Sex', name: 'Sextans', aliases: ['Sextant'] },
  { abbreviation: 'Tau', name: 'Taurus', aliases: ['Bull'] },
  { abbreviation: 'Tel', name: 'Telescopium', aliases: ['Telescope'] },
  { abbreviation: 'Tri', name: 'Triangulum', aliases: ['Triangle'] },
  { abbreviation: 'TrA', name: 'Triangulum Australe', aliases: ['Southern Triangle'] },
  { abbreviation: 'Tuc', name: 'Tucana', aliases: ['Toucan'] },
  { abbreviation: 'UMa', name: 'Ursa Major', aliases: ['Great Bear', 'Big Dipper', 'Plow'] },
  { abbreviation: 'UMi', name: 'Ursa Minor', aliases: ['Little Bear', 'Little Dipper'] },
  { abbreviation: 'Vel', name: 'Vela', aliases: ['Sails'] },
  { abbreviation: 'Vir', name: 'Virgo', aliases: ['Maiden'] },
  { abbreviation: 'Vol', name: 'Volans', aliases: ['Flying Fish'] },
  { abbreviation: 'Vul', name: 'Vulpecula', aliases: ['Little Fox'] },
]

const CANONICAL_IDENTIFIERS =
  'andromeda:And antlia:Ant apus:Aps aquarius:Aqr aquila:Aql ara:Ara aries:Ari auriga:Aur bootes:Boo caelum:Cae camelopardalis:Cam cancer:Cnc canes-venatici:CVn canis-major:CMa canis-minor:CMi capricornus:Cap carina:Car cassiopeia:Cas centaurus:Cen cepheus:Cep cetus:Cet chamaeleon:Cha circinus:Cir columba:Col coma-berenices:Com corona-australis:CrA corona-borealis:CrB corvus:Crv crater:Crt crux:Cru cygnus:Cyg delphinus:Del dorado:Dor draco:Dra equuleus:Equ eridanus:Eri fornax:For gemini:Gem grus:Gru hercules:Her horologium:Hor hydra:Hya hydrus:Hyi indus:Ind lacerta:Lac leo:Leo leo-minor:LMi lepus:Lep libra:Lib lupus:Lup lynx:Lyn lyra:Lyr mensa:Men microscopium:Mic monoceros:Mon musca:Mus norma:Nor octans:Oct ophiuchus:Oph orion:Ori pavo:Pav pegasus:Peg perseus:Per phoenix:Phe pictor:Pic pisces:Psc piscis-austrinus:PsA puppis:Pup pyxis:Pyx reticulum:Ret sagitta:Sge sagittarius:Sgr scorpius:Sco sculptor:Scl scutum:Sct serpens:Ser sextans:Sex taurus:Tau telescopium:Tel triangulum:Tri triangulum-australe:TrA tucana:Tuc ursa-major:UMa ursa-minor:UMi vela:Vel virgo:Vir volans:Vol vulpecula:Vul'
const ALLOWED_EMPTY_FIGURE_IDS = new Set(['mensa', 'microscopium'])

type HipparcosRow = {
  hip: number
  raDeg: number
  decDeg: number
  magnitude: number
  parallaxMas: number | null
  parallaxErrorMas: number | null
  pmRaMasYr: number | null
  pmDecMasYr: number | null
  spectralType: string | null
}

type GaiaRow = {
  hip: number
  sourceId: string
  raDeg: number
  decDeg: number
  magnitude: number
  bpRp: number | null
  parallaxMas: number | null
  parallaxErrorMas: number | null
  pmRaMasYr: number | null
  pmDecMasYr: number | null
  radialVelocityKmS: number | null
}

type Distance = {
  distanceLy: number | null
  errorLy: number | null
  quality: 'good' | 'uncertain' | 'poor' | 'unavailable'
}

type GeneratedStar = [
  id: string,
  hip: number,
  gaiaSourceId: string | null,
  raDeg: number,
  decDeg: number,
  positionEpochJulianYear: number,
  apparentMagnitude: number,
  magnitudeBand: 'G' | 'V',
  selectionMagnitudeV: number | null,
  spectralType: string | null,
  bpRp: number | null,
  distanceLy: number | null,
  distanceErrorLy: number | null,
  distanceQuality: Distance['quality'],
  distanceSource: 'Gaia DR3 parallax' | 'Hipparcos parallax' | null,
  pmRaMasYr: number | null,
  pmDecMasYr: number | null,
  radialVelocityKmS: number | null,
  velocityKmS: [number, number, number] | null,
  constellationIds: string[],
]

function slug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function finiteOrNull(value: string | undefined): number | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function parseLineFigures(text: string): Map<string, number[][]> {
  const figures = new Map<string, number[][]>()
  let current: string | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('* ')) {
      current = line.slice(2).trim()
      if (figures.has(current)) throw new Error(`Duplicate line-source section: ${current}`)
      figures.set(current, [])
      continue
    }
    if (current && line.startsWith('[')) {
      const path = (JSON.parse(line) as string[]).map((hip) => Number(hip.replace(/\*$/, '')))
      if (path.length >= 2 && path.every(Number.isInteger)) figures.get(current)?.push(path)
    }
  }
  return figures
}

function parseHipparcos(text: string): Map<number, HipparcosRow> {
  const rows = new Map<number, HipparcosRow>()
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*\d+\t/.test(line)) continue
    const [hipRaw, raRaw, decRaw, magnitudeRaw, parallaxRaw, errorRaw, pmRaRaw, pmDecRaw, typeRaw] =
      line.split('\t')
    const hip = Number(hipRaw)
    const raDeg = Number(raRaw)
    const decDeg = Number(decRaw)
    const magnitude = Number(magnitudeRaw)
    if (
      !Number.isInteger(hip) ||
      !Number.isFinite(raDeg) ||
      !Number.isFinite(decDeg) ||
      !Number.isFinite(magnitude)
    ) {
      continue
    }
    rows.set(hip, {
      hip,
      raDeg,
      decDeg,
      magnitude,
      parallaxMas: finiteOrNull(parallaxRaw),
      parallaxErrorMas: finiteOrNull(errorRaw),
      pmRaMasYr: finiteOrNull(pmRaRaw),
      pmDecMasYr: finiteOrNull(pmDecRaw),
      spectralType: typeRaw?.trim() || null,
    })
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"'
        index++
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      fields.push(field)
      field = ''
    } else {
      field += character
    }
  }
  fields.push(field)
  return fields
}

function parseGaia(text: string): Map<number, GaiaRow> {
  const rows = new Map<number, GaiaRow>()
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const [
      hipRaw,
      sourceId,
      raRaw,
      decRaw,
      magnitudeRaw,
      bpRpRaw,
      parallaxRaw,
      errorRaw,
      pmRaRaw,
      pmDecRaw,
      radialVelocityRaw,
    ] = parseCsvLine(line)
    const hip = Number(hipRaw)
    const raDeg = Number(raRaw)
    const decDeg = Number(decRaw)
    const magnitude = Number(magnitudeRaw)
    if (
      !Number.isInteger(hip) ||
      !sourceId ||
      !Number.isFinite(raDeg) ||
      !Number.isFinite(decDeg) ||
      !Number.isFinite(magnitude)
    ) {
      continue
    }
    rows.set(hip, {
      hip,
      sourceId,
      raDeg,
      decDeg,
      magnitude,
      bpRp: finiteOrNull(bpRpRaw),
      parallaxMas: finiteOrNull(parallaxRaw),
      parallaxErrorMas: finiteOrNull(errorRaw),
      pmRaMasYr: finiteOrNull(pmRaRaw),
      pmDecMasYr: finiteOrNull(pmDecRaw),
      radialVelocityKmS: finiteOrNull(radialVelocityRaw),
    })
  }
  return rows
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${url} → ${response.status} ${response.statusText}`)
  return response.text()
}

async function fetchGaia(selectedHips: Set<number>): Promise<Map<number, GaiaRow>> {
  const hips = [...selectedHips].sort((a, b) => a - b)
  const rows = new Map<number, GaiaRow>()
  for (let offset = 0; offset < hips.length; offset += 750) {
    const hipList = hips.slice(offset, offset + 750).join(',')
    const query = `SELECT h.original_ext_source_id AS hip, g.source_id, g.ra, g.dec,
g.phot_g_mean_mag, g.bp_rp, g.parallax, g.parallax_error, g.pmra, g.pmdec,
g.radial_velocity
FROM gaiadr3.gaia_source AS g
JOIN gaiadr3.hipparcos2_best_neighbour AS h ON g.source_id = h.source_id
WHERE h.original_ext_source_id IN (${hipList})`
    const body = new URLSearchParams({
      REQUEST: 'doQuery',
      LANG: 'ADQL',
      FORMAT: 'csv',
      QUERY: query,
    })
    const chunk = parseGaia(
      await fetchText(GAIA_TAP_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      }),
    )
    for (const [hip, row] of chunk) rows.set(hip, row)
  }
  return rows
}

function distanceFromParallax(parallaxMas: number | null, errorMas: number | null): Distance {
  if (parallaxMas === null || errorMas === null || parallaxMas <= 0 || errorMas <= 0) {
    return { distanceLy: null, errorLy: null, quality: 'unavailable' }
  }
  const signalToNoise = parallaxMas / errorMas
  const distanceLy = (1000 / parallaxMas) * PARSEC_TO_LIGHT_YEARS
  const errorLy = distanceLy * (errorMas / parallaxMas)
  const quality = signalToNoise >= 10 ? 'good' : signalToNoise >= 3 ? 'uncertain' : 'poor'
  return {
    distanceLy: Number(distanceLy.toFixed(3)),
    errorLy: Number(errorLy.toFixed(3)),
    quality,
  }
}

function velocityFromMeasurements(
  raDeg: number,
  decDeg: number,
  parallaxMas: number | null,
  pmRaMasYr: number | null,
  pmDecMasYr: number | null,
  radialVelocityKmS: number | null,
): [number, number, number] | null {
  if (
    parallaxMas === null ||
    parallaxMas <= 0 ||
    pmRaMasYr === null ||
    pmDecMasYr === null ||
    radialVelocityKmS === null
  ) {
    return null
  }
  const ra = (raDeg * Math.PI) / 180
  const dec = (decDeg * Math.PI) / 180
  const cosRa = Math.cos(ra)
  const sinRa = Math.sin(ra)
  const cosDec = Math.cos(dec)
  const sinDec = Math.sin(dec)
  const tangentialRa = (TANGENTIAL_VELOCITY_FACTOR * pmRaMasYr) / parallaxMas
  const tangentialDec = (TANGENTIAL_VELOCITY_FACTOR * pmDecMasYr) / parallaxMas
  return [
    radialVelocityKmS * cosDec * cosRa - tangentialRa * sinRa - tangentialDec * sinDec * cosRa,
    radialVelocityKmS * cosDec * sinRa + tangentialRa * cosRa - tangentialDec * sinDec * sinRa,
    radialVelocityKmS * sinDec + tangentialDec * cosDec,
  ].map((value) => Number(value.toFixed(6))) as [number, number, number]
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits))
}

const lineText = await fetchText(LINE_SOURCE_URL)
const figures = parseLineFigures(lineText)
const generatedIdentifiers = DEFINITIONS.map(
  (definition) => `${slug(definition.name)}:${definition.abbreviation}`,
).join(' ')
if (generatedIdentifiers !== CANONICAL_IDENTIFIERS) {
  throw new Error('Constellation definitions do not match the canonical 88 IDs and abbreviations')
}
if (
  new Set(DEFINITIONS.map(({ name }) => slug(name))).size !== 88 ||
  new Set(DEFINITIONS.map(({ abbreviation }) => abbreviation)).size !== 88
) {
  throw new Error('Constellation IDs and abbreviations must be unique')
}

const definitionsBySourceKey = new Map<string, ConstellationDefinition>()
for (const definition of DEFINITIONS) {
  for (const sourceKey of definition.sourceKeys ?? [definition.name.replaceAll(' ', '')]) {
    if (definitionsBySourceKey.has(sourceKey))
      throw new Error(`Duplicate expected line-source section: ${sourceKey}`)
    definitionsBySourceKey.set(sourceKey, definition)
  }
}
for (const key of figures.keys()) {
  if (!definitionsBySourceKey.has(key)) throw new Error(`Unknown line-source constellation: ${key}`)
}
for (const sourceKey of definitionsBySourceKey.keys()) {
  if (!figures.has(sourceKey)) throw new Error(`Missing line-source constellation: ${sourceKey}`)
}

const lineHips = new Set<number>()
const constellationHips = new Map<string, Set<number>>()
for (const [sourceKey, paths] of figures) {
  const definition = definitionsBySourceKey.get(sourceKey)
  if (!definition) continue
  const id = slug(definition.name)
  const hips = constellationHips.get(id) ?? new Set<number>()
  for (const path of paths) {
    for (const hip of path) {
      hips.add(hip)
      lineHips.add(hip)
    }
  }
  constellationHips.set(id, hips)
}

const hipparcos = parseHipparcos(await fetchText(HIPPARCOS_URL))
const selectedHips = new Set<number>(lineHips)
for (const row of hipparcos.values()) {
  if (row.magnitude <= CONTEXT_MAGNITUDE_LIMIT) selectedHips.add(row.hip)
}
const gaia = await fetchGaia(selectedHips)

for (const hip of lineHips) {
  if (!hipparcos.has(hip) && !gaia.has(hip))
    throw new Error(`Figure star HIP ${hip} has no catalog row`)
}

const stars: GeneratedStar[] = [...selectedHips]
  .sort((a, b) => a - b)
  .map((hip) => {
    const hipparcosRow = hipparcos.get(hip)
    const gaiaRow = gaia.get(hip)
    if (!hipparcosRow && !gaiaRow) throw new Error(`Missing selected star HIP ${hip}`)
    const astrometry = gaiaRow ?? hipparcosRow!
    const distance = distanceFromParallax(astrometry.parallaxMas, astrometry.parallaxErrorMas)
    const distanceSource =
      distance.distanceLy === null
        ? null
        : gaiaRow
          ? ('Gaia DR3 parallax' as const)
          : ('Hipparcos parallax' as const)
    const constellationIds = [...constellationHips]
      .filter(([, hips]) => hips.has(hip))
      .map(([id]) => id)
      .sort()
    return [
      `hip-${hip}`,
      hip,
      gaiaRow?.sourceId ?? null,
      round(astrometry.raDeg),
      round(astrometry.decDeg),
      gaiaRow ? 2016 : 1991.25,
      round(astrometry.magnitude, 4),
      gaiaRow ? 'G' : 'V',
      hipparcosRow === undefined ? null : round(hipparcosRow.magnitude, 4),
      hipparcosRow?.spectralType ?? null,
      gaiaRow?.bpRp === null || gaiaRow?.bpRp === undefined ? null : round(gaiaRow.bpRp, 5),
      distance.distanceLy,
      distance.errorLy,
      distance.quality,
      distanceSource,
      astrometry.pmRaMasYr === null ? null : round(astrometry.pmRaMasYr, 6),
      astrometry.pmDecMasYr === null ? null : round(astrometry.pmDecMasYr, 6),
      gaiaRow?.radialVelocityKmS === null || gaiaRow?.radialVelocityKmS === undefined
        ? null
        : round(gaiaRow.radialVelocityKmS, 6),
      velocityFromMeasurements(
        astrometry.raDeg,
        astrometry.decDeg,
        astrometry.parallaxMas,
        astrometry.pmRaMasYr,
        astrometry.pmDecMasYr,
        gaiaRow?.radialVelocityKmS ?? null,
      ),
      constellationIds,
    ]
  })

const constellations = DEFINITIONS.map((definition) => {
  const id = slug(definition.name)
  const paths = (definition.sourceKeys ?? [definition.name.replaceAll(' ', '')]).flatMap(
    (sourceKey) => figures.get(sourceKey) ?? [],
  )
  const edgeKeys = new Set<string>()
  const edges: [string, string][] = []
  for (const path of paths) {
    for (let index = 1; index < path.length; index++) {
      const edge: [string, string] = [`hip-${path[index - 1]}`, `hip-${path[index]}`]
      const key = edge.join(':')
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key)
        edges.push(edge)
      }
    }
  }
  const mayBeEmpty = ALLOWED_EMPTY_FIGURE_IDS.has(id)
  if (edges.length === 0 && !mayBeEmpty) throw new Error(`${definition.name} has no figure edges`)
  if (edges.length > 0 && mayBeEmpty)
    throw new Error(
      `${definition.name} unexpectedly has figure edges despite its empty allowlist entry`,
    )
  return [id, definition.abbreviation, definition.name, definition.aliases, edges] as const
})

const landmarks = [
  [
    'orion-nebula',
    'Orion Nebula',
    'emission nebula',
    'orion',
    83.82208,
    -5.39111,
    1344,
    20,
    'measured',
    'Milky Way',
    'https://doi.org/10.1051/0004-6361:20078247',
  ],
  [
    'pleiades',
    'Pleiades',
    'open cluster',
    'taurus',
    56.75,
    24.1167,
    444.2,
    2.9,
    'measured',
    'Milky Way',
    'https://doi.org/10.1051/0004-6361/201629272',
  ],
  [
    'lagoon-nebula',
    'Lagoon Nebula',
    'emission nebula',
    'sagittarius',
    270.925,
    -24.375,
    4100,
    null,
    'approximate',
    'Milky Way',
    'https://science.nasa.gov/missions/hubble/hubbles-28th-birthday-picture-the-lagoon-nebula/',
  ],
  [
    'carina-nebula',
    'Carina Nebula',
    'emission nebula',
    'carina',
    161.265,
    -59.6844,
    7500,
    null,
    'approximate',
    'Milky Way',
    'https://science.nasa.gov/universe/exoplanets/discovering-the-universe-through-the-constellation-carina/',
  ],
  [
    'omega-centauri',
    'Omega Centauri',
    'globular cluster',
    'centaurus',
    201.697,
    -47.4795,
    17090,
    null,
    'approximate',
    'Milky Way',
    'https://science.nasa.gov/missions/hubble/omega-centauri-home-of-millions-of-stars/',
  ],
] as const

const body = `/**
 * Generated by scripts/generate-constellation-data.ts.
 * Do not edit by hand.
 *
 * Figure lines: IAU / Alan MacRobert et al., distributed by Dominic Ford.
 * Source: ${LINE_SOURCE_PAGE} (${LINE_SOURCE_REVISION})
 * License: Creative Commons Attribution 4.0 International (CC BY 4.0).
 *
 * Stellar astrometry: ESA Gaia mission Data Release 3, processed by the Gaia
 * Data Processing and Analysis Consortium, with Hipparcos Main Catalogue
 * fallback for bright or line stars absent from Gaia.
 * Sources: ${GAIA_PAGE} and ${HIPPARCOS_PAGE}
 *
 * Landmark source URLs are retained on each record.
 */
export type GeneratedConstellationTuple = [
  id: string,
  abbreviation: string,
  name: string,
  aliases: string[],
  edges: [string, string][],
]

export type GeneratedStarTuple = [
  id: string,
  hip: number,
  gaiaSourceId: string | null,
  raDeg: number,
  decDeg: number,
  positionEpochJulianYear: number,
  apparentMagnitude: number,
  magnitudeBand: 'G' | 'V',
  selectionMagnitudeV: number | null,
  spectralType: string | null,
  bpRp: number | null,
  distanceLy: number | null,
  distanceErrorLy: number | null,
  distanceQuality: 'good' | 'uncertain' | 'poor' | 'unavailable',
  distanceSource: 'Gaia DR3 parallax' | 'Hipparcos parallax' | null,
  pmRaMasYr: number | null,
  pmDecMasYr: number | null,
  radialVelocityKmS: number | null,
  velocityKmS: [number, number, number] | null,
  constellationIds: string[],
]

export type GeneratedLandmarkTuple = [
  id: string,
  name: string,
  type: 'emission nebula' | 'open cluster' | 'globular cluster',
  constellationId: string,
  raDeg: number,
  decDeg: number,
  distanceLy: number,
  distanceErrorLy: number | null,
  distanceQuality: 'measured' | 'approximate',
  galaxy: 'Milky Way',
  sourceUrl: string,
]

export type GeneratedConstellationMeta = {
  contextMagnitudeLimit: number
  contextMagnitudeBand: 'Johnson V'
  contextMagnitudeSource: 'Hipparcos'
  lineSourceSections: string[]
  emptyFigureIds: string[]
  lineSourceUrl: string
  lineSourcePage: string
  lineSourceRevision: string
  gaiaSourceUrl: string
  hipparcosSourceUrl: string
}

export const GENERATED_CONSTELLATIONS = ${JSON.stringify(constellations)} satisfies GeneratedConstellationTuple[]

export const GENERATED_CONSTELLATION_STARS = ${JSON.stringify(stars)} satisfies GeneratedStarTuple[]

export const GENERATED_CONSTELLATION_LANDMARKS = ${JSON.stringify(landmarks)} satisfies GeneratedLandmarkTuple[]

export const GENERATED_CONSTELLATION_META = ${JSON.stringify({
  contextMagnitudeLimit: CONTEXT_MAGNITUDE_LIMIT,
  contextMagnitudeBand: 'Johnson V',
  contextMagnitudeSource: 'Hipparcos',
  lineSourceSections: [...figures.keys()],
  emptyFigureIds: [...ALLOWED_EMPTY_FIGURE_IDS],
  lineSourceUrl: LINE_SOURCE_URL,
  lineSourcePage: LINE_SOURCE_PAGE,
  lineSourceRevision: LINE_SOURCE_REVISION,
  gaiaSourceUrl: GAIA_PAGE,
  hipparcosSourceUrl: HIPPARCOS_PAGE,
})} satisfies GeneratedConstellationMeta
`

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, body)
console.log(
  `generate-constellation-data: ${constellations.length} constellations, ${stars.length} stars, ${landmarks.length} landmarks`,
)
