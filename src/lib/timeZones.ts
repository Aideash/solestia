import { Temporal } from 'temporal-polyfill/full'

export type TimeZoneGroup = {
  region: string
  ids: string[]
}

export function hostTimeZoneId(): string {
  return Temporal.Now.timeZoneId()
}

export function isTimeZoneId(id: string): boolean {
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(id)
    return true
  } catch {
    return false
  }
}

export function timeZoneLabel(id: string): string {
  return id.replaceAll('_', ' ')
}

export function groupedTimeZones(): TimeZoneGroup[] {
  const ids = new Set(
    typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
      ? Intl.supportedValuesOf('timeZone')
      : ['UTC'],
  )
  ids.add(hostTimeZoneId())
  const groups = new Map<string, string[]>()
  for (const id of [...ids].sort((a, b) => a.localeCompare(b))) {
    const slash = id.indexOf('/')
    const region = slash === -1 ? 'Other' : id.slice(0, slash)
    const list = groups.get(region)
    if (list) list.push(id)
    else groups.set(region, [id])
  }
  return [...groups.entries()].map(([region, zoneIds]) => ({ region, ids: zoneIds }))
}
