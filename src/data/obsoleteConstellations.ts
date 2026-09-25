/**
 * Stick figures for obsolete (non-IAU) constellations used as compact glyphs.
 * Kept outside the IAU-88 generated catalog so the “exactly 88” pipeline stays
 * untouched.
 *
 * Quadrans Muralis (Lalande 1795 / Bode 1801) occupied the northern Boötes–
 * Draco border; the Quadrantid radiant still bears its name. Star list from
 * the All Skies Encyclopedia bright-star ranking; edges are a compact mural-
 * quadrant silhouette (pivot at 44 Boo / Quadrans, arc toward CL Dra).
 *
 * Coordinates: SIMBAD ICRS J2000 (retrieved 2026-09-25).
 */

export type ObsoleteFigureStar = {
  readonly id: string
  readonly hip: number
  readonly raDeg: number
  readonly decDeg: number
}

export type ObsoleteFigureEdge = readonly [fromStarId: string, toStarId: string]

export type ObsoleteConstellation = {
  readonly id: string
  readonly abbreviation: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly stars: readonly ObsoleteFigureStar[]
  readonly edges: readonly ObsoleteFigureEdge[]
}

const QUADRANS_STARS: readonly ObsoleteFigureStar[] = [
  { id: 'hip-72524', hip: 72524, raDeg: 222.422053, decDeg: 48.720808 }, // 39 Boo
  { id: 'hip-73695', hip: 73695, raDeg: 225.947065, decDeg: 47.654062 }, // 44 Boo / Quadrans
  { id: 'hip-73841', hip: 73841, raDeg: 226.357644, decDeg: 48.15097 }, // 47 Boo
  { id: 'hip-76568', hip: 76568, raDeg: 234.56768, decDeg: 46.797772 }, // HR 5830
  { id: 'hip-76957', hip: 76957, raDeg: 235.711501, decDeg: 52.360901 }, // BP Boo
  { id: 'hip-78180', hip: 78180, raDeg: 239.447669, decDeg: 54.749764 }, // CL Dra
]

/**
 * Mural-quadrant outline: west pivot cluster, south radius, northeast arc,
 * and an inner brace — readable at clock-dial size.
 */
const QUADRANS_EDGES: readonly ObsoleteFigureEdge[] = [
  ['hip-72524', 'hip-73695'],
  ['hip-73695', 'hip-73841'],
  ['hip-73695', 'hip-76568'],
  ['hip-76568', 'hip-76957'],
  ['hip-76957', 'hip-78180'],
  ['hip-73841', 'hip-76957'],
  ['hip-72524', 'hip-76568'],
  ['hip-72524', 'hip-76957'],
]

export const OBSOLETE_CONSTELLATIONS: readonly ObsoleteConstellation[] = [
  {
    id: 'quadrans-muralis',
    abbreviation: 'QuM',
    name: 'Quadrans Muralis',
    aliases: ['Quadrans', 'Le Mural', 'Mural Quadrant'],
    stars: QUADRANS_STARS,
    edges: QUADRANS_EDGES,
  },
]

const BY_ID = new Map(OBSOLETE_CONSTELLATIONS.map((entry) => [entry.id, entry]))

export function obsoleteConstellationById(id: string): ObsoleteConstellation | undefined {
  return BY_ID.get(id)
}
