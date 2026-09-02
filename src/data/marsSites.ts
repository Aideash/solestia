export type MarsSite = {
  id: string
  name: string
  group: string
  /** Planetocentric east longitude, degrees. */
  longitudeEast: number
}

export const MARS_SITES: readonly MarsSite[] = [
  { id: 'airy', name: 'Airy-0 (MTC)', group: 'Coordinated', longitudeEast: 0 },
  { id: 'viking-1', name: 'Viking 1 (Chryse)', group: 'Missions', longitudeEast: 312.05 },
  { id: 'viking-2', name: 'Viking 2 (Utopia)', group: 'Missions', longitudeEast: 134.26 },
  { id: 'pathfinder', name: 'Pathfinder (Ares Vallis)', group: 'Missions', longitudeEast: 326.78 },
  { id: 'spirit', name: 'Spirit (Gusev)', group: 'Missions', longitudeEast: 175.47 },
  { id: 'opportunity', name: 'Opportunity (Meridiani)', group: 'Missions', longitudeEast: 354.47 },
  { id: 'phoenix', name: 'Phoenix (Vastitas Borealis)', group: 'Missions', longitudeEast: 234.25 },
  { id: 'curiosity', name: 'Curiosity (Gale)', group: 'Missions', longitudeEast: 137.44 },
  { id: 'insight', name: 'InSight (Elysium)', group: 'Missions', longitudeEast: 135.62 },
  { id: 'perseverance', name: 'Perseverance (Jezero)', group: 'Missions', longitudeEast: 77.45 },
  { id: 'zhurong', name: 'Zhurong (Utopia)', group: 'Missions', longitudeEast: 109.93 },
  { id: 'olympus', name: 'Olympus Mons', group: 'Geography', longitudeEast: 226.2 },
  { id: 'marineris', name: 'Valles Marineris', group: 'Geography', longitudeEast: 285 },
  { id: 'hellas', name: 'Hellas Planitia', group: 'Geography', longitudeEast: 70.5 },
  { id: 'boreum', name: 'Planum Boreum', group: 'Geography', longitudeEast: 0 },
  { id: 'australe', name: 'Planum Australe', group: 'Geography', longitudeEast: 315 },
]

const SITES_BY_ID = new Map(MARS_SITES.map((site) => [site.id, site]))

export const DEFAULT_MARS_SITE_ID = 'airy'

export function isMarsSiteId(id: string): boolean {
  return SITES_BY_ID.has(id)
}

export function marsSite(id?: string): MarsSite {
  return (id && SITES_BY_ID.get(id)) || SITES_BY_ID.get(DEFAULT_MARS_SITE_ID)!
}

export type MarsSiteGroup = {
  group: string
  sites: MarsSite[]
}

export function groupedMarsSites(): MarsSiteGroup[] {
  const groups: MarsSiteGroup[] = []
  for (const site of MARS_SITES) {
    const last = groups.at(-1)
    if (last && last.group === site.group) last.sites.push(site)
    else groups.push({ group: site.group, sites: [site] })
  }
  return groups
}
