/** Value formatting shared by the readout tables of every system view. */

export const HOURS_PER_DAY = 24
export const JULIAN_YEAR_DAYS = 365.25

/** Roughly four significant figures, so column widths stay comparable. */
export function formatQuantity(value: number, unit: string): string {
  const digits = value >= 10000 ? 0 : value >= 100 ? 1 : value >= 10 ? 2 : 3
  const number = value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${number} ${unit}`
}

/** Days shown in whichever of days, hours or minutes keeps a leading digit. */
export function formatDuration(days: number): string {
  const hours = days * HOURS_PER_DAY
  if (days >= 2) return formatQuantity(days, 'd')
  if (hours >= 2) return formatQuantity(hours, 'h')
  return formatQuantity(hours * 60, 'min')
}

export function formatDeg(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(1)}°`
}

export function formatRad(rad: number): string {
  return `${rad.toFixed(3)} rad`
}

/** For angles under a degree, where the table's usual single decimal collapses. */
export function formatFineDeg(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(2)}°`
}

export function formatEcc(e: number): string {
  if (e >= 0.1) return e.toFixed(4)
  if (e >= 0.01) return e.toFixed(5)
  return e.toFixed(6)
}

export function formatDayClock(frac: number): string {
  const totalMin = Math.round(frac * 24 * 60)
  const wrapped = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(wrapped / 60)
  const minutes = wrapped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(b)
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

/** Small integer ratio near `value`, or null if nothing is close. */
export function simpleRatio(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null
  let bestNum = 0
  let bestDen = 1
  let bestErr = Infinity
  for (let den = 1; den <= 8; den++) {
    const num = Math.round(value * den)
    if (num < 1 || num > 16) continue
    const err = Math.abs(value - num / den)
    if (err < bestErr) {
      bestErr = err
      bestNum = num
      bestDen = den
    }
  }
  if (bestNum === 0) return null
  const relative = bestErr / value
  if (relative > 0.012 && bestErr > 0.02) return null
  const g = gcd(bestNum, bestDen)
  return `${bestNum / g}:${bestDen / g}`
}
