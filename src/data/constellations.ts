import {
  GENERATED_CONSTELLATIONS,
  GENERATED_CONSTELLATION_LANDMARKS,
  GENERATED_CONSTELLATION_META,
  GENERATED_CONSTELLATION_STARS,
  type GeneratedConstellationTuple,
  type GeneratedLandmarkTuple,
  type GeneratedStarTuple,
} from './generated/constellations.ts'
import { IAU_STAR_PROPER_NAMES } from './generated/iauStarNames.ts'

export type DistanceQuality = 'good' | 'uncertain' | 'poor' | 'unavailable'

export type CartesianVelocity = readonly [xKmS: number, yKmS: number, zKmS: number]

export type ConstellationStar = {
  readonly id: string
  readonly hip: number
  readonly gaiaSourceId: string | null
  /** IAU WGSN proper name when one exists; null for catalog-only designations. */
  readonly properName: string | null
  readonly raDeg: number
  readonly decDeg: number
  readonly positionEpochJulianYear: number
  readonly apparentMagnitude: number
  readonly magnitudeBand: 'G' | 'V'
  /** Hipparcos Johnson V magnitude used for context membership; null only for Gaia-only figure stars. */
  readonly selectionMagnitudeV: number | null
  /** Published MK spectral type from Hipparcos, used as a color input when available. */
  readonly spectralType: string | null
  /** Gaia GBP − GRP color index, used as the preferred spectral-color input. */
  readonly bpRp: number | null
  readonly distanceLy: number | null
  readonly distanceErrorLy: number | null
  readonly distanceQuality: DistanceQuality
  readonly distanceSource: 'Gaia DR3 parallax' | 'Hipparcos parallax' | null
  /** Gaia or Hipparcos μα* = μα cos(δ), in milliarcseconds per year. */
  readonly pmRaMasYr: number | null
  readonly pmDecMasYr: number | null
  readonly radialVelocityKmS: number | null
  /**
   * ICRS-equatorial Cartesian velocity. Present only when parallax, both proper
   * motion components, and radial velocity were all measured.
   */
  readonly velocityKmS: CartesianVelocity | null
  readonly constellationIds: readonly string[]
}

export type ConstellationFigureEdge = readonly [fromStarId: string, toStarId: string]

export type Constellation = {
  readonly id: string
  readonly abbreviation: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly edges: readonly ConstellationFigureEdge[]
}

export type ConstellationLandmark = {
  readonly id: string
  readonly name: string
  readonly type: 'emission nebula' | 'open cluster' | 'globular cluster'
  readonly constellationId: string
  readonly raDeg: number
  readonly decDeg: number
  readonly distanceLy: number
  readonly distanceErrorLy: number | null
  readonly distanceQuality: 'measured' | 'approximate'
  readonly galaxy: 'Milky Way'
  readonly sourceUrl: string
}

export type CatalogAttribution = {
  readonly label: string
  readonly attribution: string
  readonly sourceUrl: string
  readonly sourcePageUrl?: string
  readonly revision?: string
  readonly license: string
}

export type ConstellationCatalogMeta = {
  readonly contextMagnitudeLimit: number
  readonly contextMagnitudeBand: 'Johnson V'
  readonly contextMagnitudeSource: 'Hipparcos'
  readonly lineSourceSections: readonly string[]
  readonly emptyFigureIds: readonly string[]
}

export const CONSTELLATIONS: readonly Constellation[] = (
  GENERATED_CONSTELLATIONS as GeneratedConstellationTuple[]
).map(([id, abbreviation, name, aliases, edges]) => ({
  id,
  abbreviation,
  name,
  aliases,
  edges,
}))

export const CONSTELLATION_STARS: readonly ConstellationStar[] = (
  GENERATED_CONSTELLATION_STARS as GeneratedStarTuple[]
).map(
  ([
    id,
    hip,
    gaiaSourceId,
    raDeg,
    decDeg,
    positionEpochJulianYear,
    apparentMagnitude,
    magnitudeBand,
    selectionMagnitudeV,
    spectralType,
    bpRp,
    distanceLy,
    distanceErrorLy,
    distanceQuality,
    distanceSource,
    pmRaMasYr,
    pmDecMasYr,
    radialVelocityKmS,
    velocityKmS,
    constellationIds,
  ]) => ({
    id,
    hip,
    gaiaSourceId,
    properName: IAU_STAR_PROPER_NAMES.get(hip) ?? null,
    raDeg,
    decDeg,
    positionEpochJulianYear,
    apparentMagnitude,
    magnitudeBand,
    selectionMagnitudeV,
    spectralType,
    bpRp,
    distanceLy,
    distanceErrorLy,
    distanceQuality,
    distanceSource,
    pmRaMasYr,
    pmDecMasYr,
    radialVelocityKmS,
    velocityKmS,
    constellationIds,
  }),
)

export const CONSTELLATION_LANDMARKS: readonly ConstellationLandmark[] = (
  GENERATED_CONSTELLATION_LANDMARKS as GeneratedLandmarkTuple[]
).map(
  ([
    id,
    name,
    type,
    constellationId,
    raDeg,
    decDeg,
    distanceLy,
    distanceErrorLy,
    distanceQuality,
    galaxy,
    sourceUrl,
  ]) => ({
    id,
    name,
    type,
    constellationId,
    raDeg,
    decDeg,
    distanceLy,
    distanceErrorLy,
    distanceQuality,
    galaxy,
    sourceUrl,
  }),
)

export const CONSTELLATION_CATALOG_META: Readonly<ConstellationCatalogMeta> =
  GENERATED_CONSTELLATION_META

export const CONSTELLATION_ATTRIBUTIONS: readonly CatalogAttribution[] = [
  {
    label: 'Constellation figure lines',
    attribution: 'IAU / Alan MacRobert et al.; distributed by Dominic Ford',
    sourceUrl: GENERATED_CONSTELLATION_META.lineSourceUrl,
    sourcePageUrl: GENERATED_CONSTELLATION_META.lineSourcePage,
    revision: GENERATED_CONSTELLATION_META.lineSourceRevision,
    license: 'CC BY 4.0',
  },
  {
    label: 'Constellation boundaries',
    attribution: 'Nancy G. Roman (1987), based on Delporte (1930)',
    sourceUrl: 'https://cdsarc.cds.unistra.fr/viz-bin/cat/VI/42',
    license: 'VizieR data-use policy',
  },
  {
    label: 'IAU star names',
    attribution: 'IAU Working Group on Star Names (WGSN), Catalog of Star Names',
    sourceUrl: 'https://www.iau.org/public/themes/naming_stars/',
    sourcePageUrl: 'https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt',
    license: 'CC BY',
  },
  {
    label: 'Gaia stellar astrometry',
    attribution:
      'ESA Gaia mission Data Release 3, processed by the Gaia Data Processing and Analysis Consortium',
    sourceUrl: GENERATED_CONSTELLATION_META.gaiaSourceUrl,
    license: 'Gaia data-use policy',
  },
  {
    label: 'Hipparcos bright-star fallback',
    attribution: 'The Hipparcos and Tycho Catalogues, ESA (1997)',
    sourceUrl: GENERATED_CONSTELLATION_META.hipparcosSourceUrl,
    license: 'CC BY-NC 3.0 IGO',
  },
]

const CONSTELLATIONS_BY_ID = new Map(
  CONSTELLATIONS.map((constellation) => [constellation.id, constellation]),
)

type SearchEntry = {
  constellation: Constellation
  terms: readonly string[]
}

export function normalizeConstellationSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SEARCH_ENTRIES: readonly SearchEntry[] = CONSTELLATIONS.map((constellation) => ({
  constellation,
  terms: [
    constellation.id.replaceAll('-', ' '),
    constellation.abbreviation,
    constellation.name,
    ...constellation.aliases,
  ].map(normalizeConstellationSearch),
}))

export function constellationById(id: string): Constellation | undefined {
  return CONSTELLATIONS_BY_ID.get(id)
}

function searchRank(terms: readonly string[], query: string): number {
  if (terms.some((term) => term === query)) return 0
  if (terms.some((term) => term.startsWith(query))) return 1
  if (terms.some((term) => term.split(' ').some((word) => word.startsWith(query)))) return 2
  if (terms.some((term) => term.includes(query))) return 3
  return Number.POSITIVE_INFINITY
}

export function searchConstellations(query: string): readonly Constellation[] {
  const normalized = normalizeConstellationSearch(query)
  if (!normalized) return CONSTELLATIONS
  return SEARCH_ENTRIES.map(({ constellation, terms }) => ({
    constellation,
    rank: searchRank(terms, normalized),
  }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort(
      (left, right) =>
        left.rank - right.rank || left.constellation.name.localeCompare(right.constellation.name),
    )
    .map(({ constellation }) => constellation)
}
