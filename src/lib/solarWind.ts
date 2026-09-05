import { SOLAR_WIND_PDYN_NPA, SOLAR_WIND_START_MS } from '../data/generated/solarWind.ts'
import { QUIET_PDYN_NPA } from './magnetosphere.ts'

const MS_PER_DAY = 86_400_000

export type SolarWindArchive = {
  startMs: number
  pdynNPa: readonly number[]
}

export const SOLAR_WIND: SolarWindArchive = {
  startMs: SOLAR_WIND_START_MS,
  pdynNPa: SOLAR_WIND_PDYN_NPA,
}

export type PdynSample = {
  pdynNPa: number
  omniDay: Date | null
  held: boolean
}

function utcDayStart(ms: number): number {
  return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY
}

function lastGoodIndex(archive: SolarWindArchive, from: number): number {
  for (let i = from; i >= 0; i--) {
    if (archive.pdynNPa[i] > 0) return i
  }
  return -1
}

export function pdynAt(
  at: Date,
  archive: SolarWindArchive = SOLAR_WIND,
  quietNPa = QUIET_PDYN_NPA,
): PdynSample {
  const dayMs = utcDayStart(at.getTime())
  const lastMs = archive.startMs + (archive.pdynNPa.length - 1) * MS_PER_DAY
  if (dayMs < archive.startMs) return { pdynNPa: quietNPa, omniDay: null, held: false }
  const rawIndex = Math.round((dayMs - archive.startMs) / MS_PER_DAY)
  const index = Math.min(archive.pdynNPa.length - 1, rawIndex)
  const good = lastGoodIndex(archive, index)
  if (good < 0) return { pdynNPa: quietNPa, omniDay: null, held: false }
  const omniDay = new Date(archive.startMs + good * MS_PER_DAY)
  const held = dayMs > lastMs || archive.pdynNPa[index] <= 0 || rawIndex > index
  return { pdynNPa: archive.pdynNPa[good], omniDay, held }
}

/** EpochField window on the fields page: the archive, stretched to now when live sits past the last OMNI day. */
export function solarWindBounds(
  nowMs = Date.now(),
  archive: SolarWindArchive = SOLAR_WIND,
): { fromMs: number; toMs: number } {
  const lastMs = archive.startMs + (archive.pdynNPa.length - 1) * MS_PER_DAY
  const toMs = nowMs >= archive.startMs ? Math.max(lastMs, nowMs) : lastMs
  return { fromMs: archive.startMs, toMs }
}
