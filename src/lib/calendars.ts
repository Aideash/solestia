import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from '../data/planets.ts'

export type CalendarDateParts = {
  year: number
  month: number
  day: number
}

export type CalendarCell = {
  year: number
  month: number
  day: number
  inMonth: boolean
  inWindow: boolean
}

export type MonthGrid = {
  year: number
  month: number
  heading: string
  weekdayLabels: readonly string[]
  cells: CalendarCell[]
}

export type CalendarDriver = {
  id: string
  name: string
  dateParts(instant: Date): CalendarDateParts
  monthGrid(instant: Date): MonthGrid | null
  label(instant: Date): string
}

const WEEKDAY_SUNDAY = new Date(2024, 0, 7)

function weekdayLabels(): string[] {
  const format = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(WEEKDAY_SUNDAY)
    day.setDate(WEEKDAY_SUNDAY.getDate() + i)
    return format.format(day)
  })
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function cellInWindow(year: number, month: number, day: number): boolean {
  const start = new Date(year, month - 1, day).getTime()
  const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  return end >= ELEMENTS_VALID_FROM_MS && start <= ELEMENTS_VALID_TO_MS
}

function gregorianMonthGrid(instant: Date): MonthGrid {
  const year = instant.getFullYear()
  const monthIndex = instant.getMonth()
  const month = monthIndex + 1
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const cells: CalendarCell[] = []

  /** `dayOfMonth` may fall outside 1..length; Date resolves it into the neighboring month. */
  function pushCell(dayOfMonth: number, inMonth: boolean) {
    const date = new Date(year, monthIndex, dayOfMonth)
    const cellYear = date.getFullYear()
    const cellMonth = date.getMonth() + 1
    const cellDay = date.getDate()
    cells.push({
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      inMonth,
      inWindow: cellInWindow(cellYear, cellMonth, cellDay),
    })
  }

  for (let i = 0; i < firstWeekday; i++) {
    pushCell(i + 1 - firstWeekday, false)
  }

  const thisMonthDays = daysInMonth(year, monthIndex)
  for (let day = 1; day <= thisMonthDays; day++) {
    pushCell(day, true)
  }

  const trailing = 42 - cells.length
  for (let i = 1; i <= trailing; i++) {
    pushCell(thisMonthDays + i, false)
  }

  return {
    year,
    month,
    heading: instant.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
    weekdayLabels: weekdayLabels(),
    cells,
  }
}

export const gregorianCalendar: CalendarDriver = {
  id: 'gregory',
  name: 'Gregorian',
  dateParts(instant) {
    return {
      year: instant.getFullYear(),
      month: instant.getMonth() + 1,
      day: instant.getDate(),
    }
  },
  monthGrid: gregorianMonthGrid,
  label(instant) {
    return instant.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  },
}

/** Keep clock time; clamp the day if the target month is shorter. */
export function shiftCivilMonth(instant: Date, delta: number): Date {
  const next = new Date(instant.getTime())
  const day = next.getDate()
  next.setDate(1)
  next.setMonth(next.getMonth() + delta)
  next.setDate(Math.min(day, daysInMonth(next.getFullYear(), next.getMonth())))
  return next
}

export function shiftCivilYear(instant: Date, delta: number): Date {
  const next = new Date(instant.getTime())
  const day = next.getDate()
  next.setDate(1)
  next.setFullYear(next.getFullYear() + delta)
  next.setDate(Math.min(day, daysInMonth(next.getFullYear(), next.getMonth())))
  return next
}

export function atCivilDay(instant: Date, year: number, month: number, day: number): Date {
  const next = new Date(instant.getTime())
  next.setFullYear(year, month - 1, day)
  return next
}
