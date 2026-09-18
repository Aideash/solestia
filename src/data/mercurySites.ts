export type MercurySite = {
  id: string
  name: string
  group: string
  /** Planetocentric north latitude, degrees. */
  latitudeNorth: number
  /** Planetocentric east longitude, degrees. */
  longitudeEast: number
}

/** USGS Gazetteer centers (+West) converted to east-positive longitude. */
export const MERCURY_SITES: readonly MercurySite[] = [
  {
    id: 'iau-pm',
    name: 'IAU Prime Meridian',
    group: 'Coordinated',
    latitudeNorth: 0,
    longitudeEast: 0,
  },
  {
    id: 'hun-kal',
    name: 'Hun Kal',
    group: 'Coordinated',
    latitudeNorth: -0.5,
    longitudeEast: 340,
  },
  {
    id: 'caloris',
    name: 'Caloris Planitia',
    group: 'Geography',
    latitudeNorth: 32.57,
    longitudeEast: 162.31,
  },
  {
    id: 'antoniadi',
    name: 'Antoniadi Dorsum',
    group: 'Geography',
    latitudeNorth: 27.2,
    longitudeEast: 330.35,
  },
  {
    id: 'schiaparelli',
    name: 'Schiaparelli Dorsum',
    group: 'Geography',
    latitudeNorth: 23.26,
    longitudeEast: 195.7,
  },
  {
    id: 'discovery',
    name: 'Discovery Rupes',
    group: 'Geography',
    latitudeNorth: -54.7,
    longitudeEast: 322.76,
  },
  {
    id: 'beagle',
    name: 'Beagle Rupes',
    group: 'Geography',
    latitudeNorth: -3.22,
    longitudeEast: 100.76,
  },
  {
    id: 'victoria',
    name: 'Victoria Rupes',
    group: 'Geography',
    latitudeNorth: 52.71,
    longitudeEast: 325.84,
  },
  {
    id: 'angkor',
    name: 'Angkor Vallis',
    group: 'Geography',
    latitudeNorth: 57.28,
    longitudeEast: 114.04,
  },
]

const SITES_BY_ID = new Map(MERCURY_SITES.map((site) => [site.id, site]))

export const DEFAULT_MERCURY_SITE_ID = 'iau-pm'

export function isMercurySiteId(id: string): boolean {
  return SITES_BY_ID.has(id)
}

export function mercurySite(id?: string): MercurySite {
  return (id && SITES_BY_ID.get(id)) || SITES_BY_ID.get(DEFAULT_MERCURY_SITE_ID)!
}

export type MercurySiteGroup = {
  group: string
  sites: MercurySite[]
}

export function groupedMercurySites(): MercurySiteGroup[] {
  const groups: MercurySiteGroup[] = []
  for (const site of MERCURY_SITES) {
    const last = groups.at(-1)
    if (last && last.group === site.group) last.sites.push(site)
    else groups.push({ group: site.group, sites: [site] })
  }
  return groups
}
