import type { PlanetId } from './planets.ts'

export type TimePageRouteName = 'earth-time' | 'mars-time' | 'mercury-time'

export type TimePage = {
  routeName: TimePageRouteName
}

export const TIME_PAGES: Partial<Record<PlanetId, TimePage>> = {
  mercury: { routeName: 'mercury-time' },
  earth: { routeName: 'earth-time' },
  mars: { routeName: 'mars-time' },
}

export function timePageFor(id: string): TimePage | undefined {
  return TIME_PAGES[id as PlanetId]
}
