import {
  gregorianToMetric,
  metricToGregorian,
  type MetricDate,
  type PeriodType,
} from 'metric-calendar'
import { Temporal } from 'temporal-polyfill/full'
import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from '../data/planets.ts'

export type CalendarDateParts = {
  year: number
  month: number
  monthCode: string
  day: number
  key: string
}

export type CalendarCell = {
  day: number
  key: string
  instant: Date
  inMonth: boolean
  inWindow: boolean
  label?: string
  title?: string
}

export type CalendarColumnLabel = {
  short: string
  long: string
}

export type MonthGrid = {
  headingPrimary: string
  headingSecondary?: string
  headingTitle?: string
  columnCount: number
  weekdayLabels: readonly CalendarColumnLabel[]
  cells: CalendarCell[]
}

export type CalendarDriver = {
  id: string
  name: string
  nativeLocale?: string
  dateParts(instant: Date): CalendarDateParts
  monthGrid(instant: Date, locale?: string): MonthGrid | null
  label(instant: Date, locale?: string): string
  shiftMonth(instant: Date, delta: number): Date
  shiftYear(instant: Date, delta: number): Date
}

const WEEKDAY_SUNDAY = new Date(2024, 0, 7)
const MS_PER_DAY = 86_400_000
const UNIX_EPOCH_JULIAN_DATE = 2_440_587.5
const PARIS_OBSERVATORY_OFFSET_MS = 561_000
const CALENDAR_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}

function weekdayLabels(locale?: string): CalendarColumnLabel[] {
  const shortFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const longFormat = new Intl.DateTimeFormat(locale, { weekday: 'long' })
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(WEEKDAY_SUNDAY)
    day.setDate(WEEKDAY_SUNDAY.getDate() + i)
    return {
      short: shortFormat.format(day),
      long: longFormat.format(day),
    }
  })
}

const HEAVENLY_STEMS = [
  { keys: ['jia', '甲'], element: 'Wood', polarity: 'Yang' },
  { keys: ['yi', '乙'], element: 'Wood', polarity: 'Yin' },
  { keys: ['bing', '丙'], element: 'Fire', polarity: 'Yang' },
  { keys: ['ding', '丁'], element: 'Fire', polarity: 'Yin' },
  { keys: ['wu', '戊'], element: 'Earth', polarity: 'Yang' },
  { keys: ['ji', '己'], element: 'Earth', polarity: 'Yin' },
  { keys: ['geng', '庚'], element: 'Metal', polarity: 'Yang' },
  { keys: ['xin', '辛'], element: 'Metal', polarity: 'Yin' },
  { keys: ['ren', '壬'], element: 'Water', polarity: 'Yang' },
  { keys: ['gui', '癸'], element: 'Water', polarity: 'Yin' },
] as const

export const EARTHLY_BRANCHES = [
  { keys: ['zi', '子'], animal: 'Rat' },
  { keys: ['chou', '丑'], animal: 'Ox' },
  { keys: ['yin', '寅'], animal: 'Tiger' },
  { keys: ['mao', '卯'], animal: 'Rabbit' },
  { keys: ['chen', '辰'], animal: 'Dragon' },
  { keys: ['si', '巳'], animal: 'Snake' },
  { keys: ['wu', '午'], animal: 'Horse' },
  { keys: ['wei', '未'], animal: 'Goat' },
  { keys: ['shen', '申'], animal: 'Monkey' },
  { keys: ['you', '酉'], animal: 'Rooster' },
  { keys: ['xu', '戌'], animal: 'Dog' },
  { keys: ['hai', '亥'], animal: 'Pig' },
] as const

function isChineseLocale(locale?: string): boolean {
  const resolved = new Intl.DateTimeFormat(locale).resolvedOptions().locale
  return resolved === 'zh' || resolved.startsWith('zh-')
}

function rewriteLeapMonth(value: string): string {
  return value.endsWith('bis') ? `Leap ${value.slice(0, -3)}` : value
}

function sexagenaryParts(yearName: string): { stem: string; branch: string } | undefined {
  const hyphen = yearName.indexOf('-')
  if (hyphen > 0) {
    return { stem: yearName.slice(0, hyphen), branch: yearName.slice(hyphen + 1) }
  }
  const chars = [...yearName]
  if (chars.length === 2 && chars[0] && chars[1]) {
    return { stem: chars[0], branch: chars[1] }
  }
  return undefined
}

function sexagenaryTitle(yearName: string): string | undefined {
  const parts = sexagenaryParts(yearName)
  if (!parts) return undefined
  const stem = HEAVENLY_STEMS.find((entry) =>
    entry.keys.some((key) => key.toLowerCase() === parts.stem.toLowerCase()),
  )
  const branch = EARTHLY_BRANCHES.find((entry) =>
    entry.keys.some((key) => key.toLowerCase() === parts.branch.toLowerCase()),
  )
  if (!stem || !branch) return undefined
  return `${stem.element} (${stem.polarity}) — Heavenly Stem\n${branch.animal} — Earthly Branch`
}

function localCalendarDate(instant: Date, calendarId: string) {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .withCalendar(calendarId)
}

function dateAtTime(date: Temporal.PlainDate, time: Temporal.PlainTime, timeZoneId: string): Date {
  const epochMilliseconds = date.toPlainDateTime(time).toZonedDateTime(timeZoneId).epochMilliseconds
  return new Date(epochMilliseconds)
}

/**
 * Intl names a month from an instant using the host's own calendar data, which can place a
 * lunisolar month boundary a day away from Temporal's when a new moon falls near midnight.
 * Naming the month from a day near its middle keeps the label on the month the grid was built
 * from, instead of borrowing its neighbor's name.
 */
function headingAnchor(first: Temporal.PlainDate): Temporal.PlainDate {
  return first.add({ days: Math.floor((first.daysInMonth - 1) / 2) })
}

/** ICU marks lunisolar leap months with a "bis" suffix on the month name. */
function formatHeading(format: Intl.DateTimeFormat, at: Date): string {
  return format
    .formatToParts(at)
    .map((part) => (part.type === 'month' ? rewriteLeapMonth(part.value) : part.value))
    .join('')
}

function calendarPart(parts: Intl.DateTimeFormatPart[], type: string): string | undefined {
  return parts.find((part) => (part.type as string) === type)?.value
}

function chineseHeading(
  format: Intl.DateTimeFormat,
  at: Date,
  locale?: string,
): Pick<MonthGrid, 'headingPrimary' | 'headingSecondary' | 'headingTitle'> {
  const parts = format
    .formatToParts(at)
    .map((part) =>
      part.type === 'month' ? { ...part, value: rewriteLeapMonth(part.value) } : part,
    )
  const yearName = calendarPart(parts, 'yearName')
  const headingTitle = yearName ? sexagenaryTitle(yearName) : undefined
  if (isChineseLocale(locale)) {
    return {
      headingPrimary: parts.map((part) => part.value).join(''),
      headingTitle,
    }
  }
  const month = calendarPart(parts, 'month') ?? ''
  const relatedYear = calendarPart(parts, 'relatedYear')
  const headingSecondary =
    relatedYear && yearName ? `${relatedYear} (${yearName})` : (relatedYear ?? yearName)
  return {
    headingPrimary: month,
    headingSecondary,
    headingTitle,
  }
}

function cellInWindow(date: Temporal.PlainDate, timeZoneId: string): boolean {
  const start = date.toPlainDateTime().toZonedDateTime(timeZoneId).epochMilliseconds
  const end =
    date.add({ days: 1 }).toPlainDateTime().toZonedDateTime(timeZoneId).epochMilliseconds - 1
  return end >= ELEMENTS_VALID_FROM_MS && start <= ELEMENTS_VALID_TO_MS
}

type CivilDate = {
  year: number
  month: number
  day: number
}

type FrenchRepublicanDate = CalendarDateParts & {
  complementary: boolean
}

const FRENCH_MONTHS = [
  'Vendémiaire',
  'Brumaire',
  'Frimaire',
  'Nivôse',
  'Pluviôse',
  'Ventôse',
  'Germinal',
  'Floréal',
  'Prairial',
  'Messidor',
  'Thermidor',
  'Fructidor',
] as const

const FRENCH_DECADE_DAYS: readonly CalendarColumnLabel[] = [
  { short: 'pr', long: 'Primidi' },
  { short: 'du', long: 'Duodi' },
  { short: 'tr', long: 'Tridi' },
  { short: 'qu', long: 'Quartidi' },
  { short: 'qi', long: 'Quintidi' },
  { short: 'se', long: 'Sextidi' },
  { short: 'sp', long: 'Septidi' },
  { short: 'oc', long: 'Octidi' },
  { short: 'no', long: 'Nonidi' },
  { short: 'dé', long: 'Décadi' },
]

const COMPLEMENTARY_DAYS = [
  'Fête de la Vertu',
  'Fête du Génie',
  'Fête du Travail',
  "Fête de l'Opinion",
  'Fête des Récompenses',
  'Fête de la Révolution',
] as const

const METRIC_DECADE_DAYS: readonly CalendarColumnLabel[] = [
  { short: 'pr', long: 'Primday' },
  { short: 'du', long: 'Duoday' },
  { short: 'tr', long: 'Triday' },
  { short: 'qu', long: 'Quadday' },
  { short: 'qi', long: 'Quintday' },
  { short: 'he', long: 'Hexday' },
  { short: 'se', long: 'Septday' },
  { short: 'oc', long: 'Octday' },
  { short: 'no', long: 'Novday' },
  { short: 'de', long: 'Decday' },
]

const METRIC_MONTHS = [
  'Unil',
  'Duil',
  'Tril',
  'Quadril',
  'Quintil',
  'Sextil',
  'Septil',
  'Octil',
  'Novil',
  'Decil',
  'Undecil',
  'Duodecil',
] as const

const METRIC_TURNING_DAYS = ['Vigil', 'Balance', 'Dawn'] as const
const METRIC_YULE_DAYS = ['Yule Eve', 'Midwinter', 'Kindling'] as const

const EQUINOX_TERMS = [
  [485, 324.96, 1934.136],
  [324, 337.23, 32964.467],
  [79, 342.08, 20.186],
  [53, 27.85, 445267.112],
  [21, 73.14, 45036.886],
  [17, 171.52, 22518.443],
  [16, 222.54, 65928.934],
  [12, 296.72, 3034.906],
  [10, 243.58, 9037.513],
  [8, 119.81, 33718.147],
  [8, 297.17, 150.678],
  [7, 21.02, 2281.226],
  [7, 247.54, 29929.562],
  [6, 325.15, 31555.956],
  [5, 60.93, 4443.417],
  [5, 155.12, 67555.328],
  [4, 288.79, 4562.452],
  [4, 198.04, 62894.029],
  [4, 199.76, 31436.921],
  [3, 95.39, 14577.848],
  [3, 287.11, 31931.756],
  [3, 320.81, 34777.259],
  [3, 227.73, 1222.114],
  [3, 15.45, 16859.074],
] as const

const frenchYearStartCache = new Map<number, CivilDate>()

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * September equinox, using Meeus's polynomial and periodic correction. The returned civil
 * date is the date at the Paris Observatory's historical local-mean-time longitude.
 */
function septemberEquinoxDate(gregorianYear: number): CivilDate {
  const cached = frenchYearStartCache.get(gregorianYear)
  if (cached) return cached

  const y = (gregorianYear - 2000) / 1000
  const jde0 =
    2451810.21715 + 365242.01767 * y - 0.11575 * y ** 2 + 0.00337 * y ** 3 + 0.00078 * y ** 4
  const t = (jde0 - 2451545) / 36525
  const w = degreesToRadians(35999.373 * t - 2.47)
  const deltaLambda = 1 + 0.0334 * Math.cos(w) + 0.0007 * Math.cos(2 * w)
  const periodicSum = EQUINOX_TERMS.reduce(
    (sum, [amplitude, phase, frequency]) =>
      sum + amplitude * Math.cos(degreesToRadians(phase + frequency * t)),
    0,
  )
  const jde = jde0 + (0.00001 * periodicSum) / deltaLambda
  const atParis = new Date(
    (jde - UNIX_EPOCH_JULIAN_DATE) * MS_PER_DAY + PARIS_OBSERVATORY_OFFSET_MS,
  )
  const result = {
    year: atParis.getUTCFullYear(),
    month: atParis.getUTCMonth() + 1,
    day: atParis.getUTCDate(),
  }
  frenchYearStartCache.set(gregorianYear, result)
  return result
}

function localCivilDate(instant: Date): CivilDate {
  return {
    year: instant.getFullYear(),
    month: instant.getMonth() + 1,
    day: instant.getDate(),
  }
}

function civilOrdinal(date: CivilDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / MS_PER_DAY)
}

function civilDateFromOrdinal(ordinal: number): CivilDate {
  const date = new Date(ordinal * MS_PER_DAY)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function civilDateAtViewedTime(date: CivilDate, viewed: Date): Date {
  return new Date(
    date.year,
    date.month - 1,
    date.day,
    viewed.getHours(),
    viewed.getMinutes(),
    viewed.getSeconds(),
    viewed.getMilliseconds(),
  )
}

function civilDateInWindow(date: CivilDate): boolean {
  const start = new Date(date.year, date.month - 1, date.day).getTime()
  const end = new Date(date.year, date.month - 1, date.day + 1).getTime() - 1
  return end >= ELEMENTS_VALID_FROM_MS && start <= ELEMENTS_VALID_TO_MS
}

function frenchDateParts(instant: Date): FrenchRepublicanDate {
  const civil = localCivilDate(instant)
  const ordinal = civilOrdinal(civil)
  let equinoxYear = civil.year
  let yearStart = septemberEquinoxDate(equinoxYear)
  if (ordinal < civilOrdinal(yearStart)) {
    equinoxYear -= 1
    yearStart = septemberEquinoxDate(equinoxYear)
  }

  const year = equinoxYear - 1791
  const dayOfYear = ordinal - civilOrdinal(yearStart)
  const complementary = dayOfYear >= 360
  const month = complementary ? 0 : Math.floor(dayOfYear / 30) + 1
  const day = complementary ? dayOfYear - 359 : (dayOfYear % 30) + 1
  const monthCode = complementary ? 'complementary' : `M${String(month).padStart(2, '0')}`
  return {
    year,
    month,
    monthCode,
    day,
    complementary,
    key: `french-republican-${year}-${monthCode}-${day}`,
  }
}

function frenchPeriodLength(year: number, period: number): number {
  if (period < 12) return 30
  const equinoxYear = year + 1791
  return (
    civilOrdinal(septemberEquinoxDate(equinoxYear + 1)) -
    civilOrdinal(septemberEquinoxDate(equinoxYear)) -
    360
  )
}

function frenchDateToCivil(year: number, period: number, day: number): CivilDate {
  const yearStart = septemberEquinoxDate(year + 1791)
  const offset = period < 12 ? period * 30 + day - 1 : 360 + day - 1
  return civilDateFromOrdinal(civilOrdinal(yearStart) + offset)
}

function shiftFrenchPeriod(instant: Date, delta: number): Date {
  const parts = frenchDateParts(instant)
  const currentPeriod = parts.complementary ? 12 : parts.month - 1
  const absolutePeriod = parts.year * 13 + currentPeriod + delta
  const year = Math.floor(absolutePeriod / 13)
  const period = ((absolutePeriod % 13) + 13) % 13
  const day = Math.min(parts.day, frenchPeriodLength(year, period))
  return civilDateAtViewedTime(frenchDateToCivil(year, period, day), instant)
}

function makeFrenchRepublicanDriver(): CalendarDriver {
  return {
    id: 'french-republican',
    name: 'French Republican',
    dateParts: frenchDateParts,
    monthGrid(instant) {
      const selected = frenchDateParts(instant)
      const period = selected.complementary ? 12 : selected.month - 1
      const length = frenchPeriodLength(selected.year, period)
      const cells = Array.from({ length }, (_, index) => {
        const day = index + 1
        const civil = frenchDateToCivil(selected.year, period, day)
        const monthCode =
          period === 12 ? 'complementary' : `M${String(period + 1).padStart(2, '0')}`
        return {
          day,
          key: `french-republican-${selected.year}-${monthCode}-${day}`,
          instant: civilDateAtViewedTime(civil, instant),
          inMonth: true,
          inWindow: civilDateInWindow(civil),
          label:
            period === 12
              ? COMPLEMENTARY_DAYS[index]?.replace(/^Fête (de la |du |des |d')/, '')
              : undefined,
          title: period === 12 ? COMPLEMENTARY_DAYS[index] : undefined,
        }
      })

      return {
        headingPrimary:
          period === 12
            ? `Jours complémentaires · An ${selected.year}`
            : `${FRENCH_MONTHS[period]} · An ${selected.year}`,
        columnCount: period === 12 ? length : 10,
        weekdayLabels: period === 12 ? [] : FRENCH_DECADE_DAYS,
        cells,
      }
    },
    label(instant) {
      const parts = frenchDateParts(instant)
      if (parts.complementary) {
        return `${COMPLEMENTARY_DAYS[parts.day - 1]}, An ${parts.year}`
      }
      const weekday = FRENCH_DECADE_DAYS[(parts.day - 1) % 10]?.long
      return `${weekday}, ${parts.day} ${FRENCH_MONTHS[parts.month - 1]}, An ${parts.year}`
    },
    shiftMonth: shiftFrenchPeriod,
    shiftYear(instant, delta) {
      const parts = frenchDateParts(instant)
      const period = parts.complementary ? 12 : parts.month - 1
      const year = parts.year + delta
      const day = Math.min(parts.day, frenchPeriodLength(year, period))
      return civilDateAtViewedTime(frenchDateToCivil(year, period, day), instant)
    },
  }
}

function metricDateAtLocalCivilDate(instant: Date): MetricDate {
  return gregorianToMetric(
    new Date(Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate())),
  )
}

function metricPeriodIndex(date: MetricDate): number {
  if (date.isTurning) return 0
  if (date.isYule) return 10
  return date.month <= 9 ? date.month : date.month + 1
}

function metricSpecialDay(date: MetricDate): number {
  const names: readonly string[] = date.isTurning ? METRIC_TURNING_DAYS : METRIC_YULE_DAYS
  return Math.max(1, names.indexOf(date.specialDay) + 1)
}

function metricParts(instant: Date): CalendarDateParts {
  const metric = metricDateAtLocalCivilDate(instant)
  const day = metric.month === 0 ? metricSpecialDay(metric) : metric.day
  const monthCode = metric.isTurning
    ? 'turning'
    : metric.isYule
      ? 'yule'
      : `M${String(metric.month).padStart(2, '0')}`
  return {
    year: metric.year,
    month: metric.month,
    monthCode,
    day,
    key: `metric-${metric.year}-${monthCode}-${day}`,
  }
}

function metricPeriodDetails(
  year: number,
  period: number,
): {
  type: PeriodType
  value: number
  length: number
  heading: string
  specialNames?: readonly string[]
} {
  if (period === 0) {
    return {
      type: 'turning',
      value: 0,
      length: 3,
      heading: `The Turning · Year ${year}`,
      specialNames: METRIC_TURNING_DAYS,
    }
  }
  if (period === 10) {
    const turning = gregorianToMetric(metricToGregorian(year, 'turning', 0))
    return {
      type: 'yule',
      value: 0,
      length: turning.isLeapYear ? 3 : 2,
      heading: `Yule · Year ${year}`,
      specialNames: METRIC_YULE_DAYS,
    }
  }
  const month = period <= 9 ? period : period - 1
  return {
    type: 'month',
    value: month,
    length: 30,
    heading: `${METRIC_MONTHS[month - 1]} · Year ${year}`,
  }
}

function metricDateToCivil(year: number, period: number, day: number): CivilDate {
  const details = metricPeriodDetails(year, period)
  const gregorian = metricToGregorian(
    year,
    details.type,
    details.type === 'month' ? details.value : day - 1,
    day,
  )
  return {
    year: gregorian.getUTCFullYear(),
    month: gregorian.getUTCMonth() + 1,
    day: gregorian.getUTCDate(),
  }
}

function shiftMetricPeriod(instant: Date, delta: number): Date {
  const metric = metricDateAtLocalCivilDate(instant)
  const currentPeriod = metricPeriodIndex(metric)
  const currentDay = metric.month === 0 ? metricSpecialDay(metric) : metric.day
  const absolutePeriod = metric.year * 14 + currentPeriod + delta
  const year = Math.floor(absolutePeriod / 14)
  const period = ((absolutePeriod % 14) + 14) % 14
  const day = Math.min(currentDay, metricPeriodDetails(year, period).length)
  return civilDateAtViewedTime(metricDateToCivil(year, period, day), instant)
}

function makeMetricCalendarDriver(): CalendarDriver {
  return {
    id: 'metric',
    name: 'Metric (modern)',
    dateParts: metricParts,
    monthGrid(instant) {
      const metric = metricDateAtLocalCivilDate(instant)
      const period = metricPeriodIndex(metric)
      const details = metricPeriodDetails(metric.year, period)
      const monthCode =
        details.type === 'month' ? `M${String(details.value).padStart(2, '0')}` : details.type
      const cells = Array.from({ length: details.length }, (_, index) => {
        const day = index + 1
        const civil = metricDateToCivil(metric.year, period, day)
        return {
          day,
          key: `metric-${metric.year}-${monthCode}-${day}`,
          instant: civilDateAtViewedTime(civil, instant),
          inMonth: true,
          inWindow: civilDateInWindow(civil),
          label: details.specialNames?.[index],
          title: details.specialNames?.[index],
        }
      })
      return {
        headingPrimary: details.heading,
        columnCount: details.type === 'month' ? 10 : details.length,
        weekdayLabels: details.type === 'month' ? METRIC_DECADE_DAYS : [],
        cells,
      }
    },
    label(instant) {
      const metric = metricDateAtLocalCivilDate(instant)
      if (metric.month === 0) return `${metric.specialDay}, Year ${metric.year}`
      return `${metric.dayName}, ${metric.monthName} ${metric.day}, Year ${metric.year}`
    },
    shiftMonth: shiftMetricPeriod,
    shiftYear(instant, delta) {
      const metric = metricDateAtLocalCivilDate(instant)
      const period = metricPeriodIndex(metric)
      const currentDay = metric.month === 0 ? metricSpecialDay(metric) : metric.day
      const year = metric.year + delta
      const day = Math.min(currentDay, metricPeriodDetails(year, period).length)
      return civilDateAtViewedTime(metricDateToCivil(year, period, day), instant)
    },
  }
}

function makeCalendarDriver(id: string, name: string, nativeLocale?: string): CalendarDriver {
  return {
    id,
    name,
    nativeLocale,
    dateParts(instant) {
      const date = localCalendarDate(instant, id).toPlainDate()
      return {
        year: date.year,
        month: date.month,
        monthCode: date.monthCode,
        day: date.day,
        key: date.toString(),
      }
    },
    monthGrid(instant, locale) {
      /** A calendar can fail on hosts whose ICU data the polyfill cannot read; degrade instead. */
      try {
        const viewed = localCalendarDate(instant, id)
        const selectedDate = viewed.toPlainDate()
        const first = selectedDate.with({ day: 1 })
        const gridStart = first.subtract({ days: first.dayOfWeek % 7 })
        const time = viewed.toPlainTime()
        const timeZoneId = viewed.timeZoneId
        const cells = Array.from({ length: 42 }, (_, index) => {
          const date = gridStart.add({ days: index })
          return {
            day: date.day,
            key: date.toString(),
            instant: dateAtTime(date, time, timeZoneId),
            inMonth: date.year === first.year && date.monthCode === first.monthCode,
            inWindow: cellInWindow(date, timeZoneId),
          }
        })
        const headingAt = dateAtTime(headingAnchor(first), time, timeZoneId)
        const headingFormat = new Intl.DateTimeFormat(locale, {
          calendar: id,
          year: 'numeric',
          month: 'long',
        })
        const heading =
          id === 'chinese'
            ? chineseHeading(headingFormat, headingAt, locale)
            : { headingPrimary: formatHeading(headingFormat, headingAt) }

        return {
          ...heading,
          columnCount: 7,
          weekdayLabels: weekdayLabels(locale),
          cells,
        }
      } catch (error) {
        console.warn(`The ${name} calendar is unavailable in this browser`, error)
        return null
      }
    },
    label(instant, locale) {
      return new Intl.DateTimeFormat(locale, {
        ...CALENDAR_FORMAT_OPTIONS,
        calendar: id,
      }).format(instant)
    },
    shiftMonth(instant, delta) {
      const next = localCalendarDate(instant, id).add({ months: delta }, { overflow: 'constrain' })
      return new Date(next.epochMilliseconds)
    },
    shiftYear(instant, delta) {
      const next = localCalendarDate(instant, id).add({ years: delta }, { overflow: 'constrain' })
      return new Date(next.epochMilliseconds)
    },
  }
}

export const calendarDrivers = [
  makeCalendarDriver('gregory', 'Gregorian'),
  makeCalendarDriver('persian', 'Persian (Jalali)', 'fa'),
  makeCalendarDriver('islamic-civil', 'Islamic (civil)', 'ar'),
  makeCalendarDriver('chinese', 'Chinese', 'zh'),
  makeCalendarDriver('hebrew', 'Hebrew', 'he'),
  makeFrenchRepublicanDriver(),
  makeMetricCalendarDriver(),
] as const

export const gregorianCalendar = calendarDrivers[0]
