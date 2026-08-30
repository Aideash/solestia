<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { SELECTION_NOTES } from '../data/selectionNotes.ts'
import {
  JUPITER_RADIUS_KM,
  eccentricityWobble,
  orbitPoint,
  wrapRad,
  type JupiterSystemSnapshot,
  type PlanetState,
  type SolarSystemSnapshot,
} from '../lib/kepler.ts'

const props = defineProps<{
  snapshot: SolarSystemSnapshot | JupiterSystemSnapshot
  system?: 'solar' | 'jupiter'
  selectedPlanet?: string | null
  live?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  open: []
}>()

const system = computed(() => props.system ?? 'solar')
const isJupiter = computed(() => system.value === 'jupiter')

function isJupiterSnapshot(
  snapshot: SolarSystemSnapshot | JupiterSystemSnapshot,
): snapshot is JupiterSystemSnapshot {
  return 'moons' in snapshot
}

type OrreryBody = PlanetState | JupiterSystemSnapshot['moons'][number]

const bodies = computed((): OrreryBody[] =>
  isJupiterSnapshot(props.snapshot) ? props.snapshot.moons : props.snapshot.planets,
)

const size = 100
const cx = size / 2
const cy = size / 2
const innerR = 10
const outerR = 46
// Vertical breathing room so the peri/aph labels outside the outer ring aren't clipped.
const padY = 3
const viewBox = `0 ${-padY} ${size} ${size + padY * 2}`

const perihelionMark = orbitPoint(cx, cy, outerR + 2.2, 0)
const aphelionMark = orbitPoint(cx, cy, outerR + 2.2, Math.PI)

/**
 * Whisker marking where each planet's prime meridian points. It clears the disc
 * by `facingGap`, then runs between `facingMin` and `facingMax` so a meridian
 * tipped out of the ecliptic reads as foreshortened without ever vanishing.
 * The longest whisker stays well inside the gap to the next ring.
 */
const facingGap = 0.25
const facingMin = 0.4
const facingMax = 1.45

/**
 * The same whisker for the Sun, scaled to its larger disc. It reaches at most
 * `sunR + sunFacingGap + sunFacingMax` from the center, well short of Mercury.
 */
const sunR = 3.5
const sunFacingGap = 0.35
const sunFacingMin = 0.6
const sunFacingMax = 1.6

function formatDeg(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(1)}°`
}

function formatRad(rad: number): string {
  return `${rad.toFixed(3)} rad`
}

/** For angles under a degree, where the table's usual single decimal collapses. */
function formatFineDeg(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(2)}°`
}

const JULIAN_YEAR_DAYS = 365.25
const HOURS_PER_DAY = 24

type RotationKind = 'sidereal' | 'solar' | 'jovian'
type OrbitUnit = 'earth' | 'local'

/** A Jupiter day needs a Jupiter to watch, so it is offered only in that system. */
const ROTATION_KINDS_SOLAR: RotationKind[] = ['sidereal', 'solar']
const ROTATION_KINDS_JUPITER: RotationKind[] = ['sidereal', 'solar', 'jovian']

const ROTATION_KIND_WORDS: Record<RotationKind, string> = {
  sidereal: 'a sidereal day, one spin against the stars',
  solar: 'a solar day, noon to noon',
  jovian: 'a Jupiter day, until Jupiter stands on the same meridian again',
}

const chosenRotationKind = ref<RotationKind>('sidereal')
const orbitUnit = ref<OrbitUnit>('earth')

const rotationKinds = computed(() =>
  isJupiter.value ? ROTATION_KINDS_JUPITER : ROTATION_KINDS_SOLAR,
)

const rotationKind = computed(() =>
  rotationKinds.value.includes(chosenRotationKind.value) ? chosenRotationKind.value : 'sidereal',
)

const showFacing = ref(true)
const showPerihelion = ref(true)
const showSunFacing = ref(true)
const showNotes = ref(true)

const settingsOpen = ref(false)
const settingsRoot = ref<HTMLElement | null>(null)
const columnsOpen = ref(false)
const columnsRoot = ref<HTMLElement | null>(null)

const COLUMN_IDS = [
  'e',
  'obliquity',
  'rotation',
  'orbit',
  'longitude',
  'anomaly',
  'inclination',
  'day',
  'libration',
  'w0',
  'resonance',
  'a',
  'q',
  'Q',
] as const

type ColumnId = (typeof COLUMN_IDS)[number]

type ColumnMeta = { id: ColumnId; heading: string; label: string; onByDefault: boolean }

const COLUMN_CATALOG_SOLAR: ColumnMeta[] = [
  { id: 'e', heading: 'e', label: 'Eccentricity (e)', onByDefault: true },
  { id: 'obliquity', heading: 'ε', label: 'Obliquity (ε)', onByDefault: true },
  { id: 'rotation', heading: 'P_rot', label: 'Rotation period', onByDefault: true },
  { id: 'orbit', heading: 'P_orb', label: 'Orbital period', onByDefault: true },
  { id: 'longitude', heading: 'λ', label: 'Longitude (λ)', onByDefault: false },
  { id: 'anomaly', heading: 'ν', label: 'True anomaly (ν)', onByDefault: false },
  { id: 'inclination', heading: 'i', label: 'Orbital inclination (i)', onByDefault: false },
  { id: 'day', heading: 'rot', label: 'Rotation progress', onByDefault: false },
  { id: 'libration', heading: 'eot', label: 'Equation of time (eot)', onByDefault: false },
  { id: 'w0', heading: 'W₀', label: 'Prime meridian at J2000 (W₀)', onByDefault: false },
  { id: 'resonance', heading: 'P_orb/P_rot', label: 'Spin–orbit ratio', onByDefault: false },
  { id: 'a', heading: 'a', label: 'Mean distance (a)', onByDefault: false },
  { id: 'q', heading: 'q', label: 'Perihelion distance (q)', onByDefault: false },
  { id: 'Q', heading: 'Q', label: 'Aphelion distance (Q)', onByDefault: false },
]

const COLUMN_CATALOG_JUPITER: ColumnMeta[] = [
  { id: 'e', heading: 'e', label: 'Eccentricity (e)', onByDefault: true },
  { id: 'obliquity', heading: 'ε', label: 'Obliquity (ε)', onByDefault: false },
  { id: 'rotation', heading: 'P_rot', label: 'Rotation period', onByDefault: true },
  { id: 'orbit', heading: 'P_orb', label: 'Orbital period', onByDefault: true },
  { id: 'longitude', heading: 'λ', label: 'Planetocentric longitude (λ)', onByDefault: false },
  { id: 'anomaly', heading: 'ν', label: 'True anomaly (ν)', onByDefault: false },
  {
    id: 'inclination',
    heading: 'i',
    label: 'Inclination to the Laplace plane (i)',
    onByDefault: false,
  },
  { id: 'day', heading: 'rot', label: 'Rotation progress', onByDefault: false },
  { id: 'libration', heading: 'lib', label: 'Libration of Jupiter (lib)', onByDefault: false },
  { id: 'w0', heading: 'W₀', label: 'Prime meridian at J2000 (W₀)', onByDefault: false },
  { id: 'resonance', heading: 'P_orb/P_rot', label: 'Spin–orbit ratio', onByDefault: false },
  { id: 'a', heading: 'a', label: 'Mean distance (a)', onByDefault: false },
  { id: 'q', heading: 'q', label: 'Perijove distance (q)', onByDefault: false },
  { id: 'Q', heading: 'Q', label: 'Apojove distance (Q)', onByDefault: false },
]

const COLUMN_CATALOG = computed(() =>
  isJupiter.value ? COLUMN_CATALOG_JUPITER : COLUMN_CATALOG_SOLAR,
)

const DEFAULT_COLUMNS_SOLAR = COLUMN_CATALOG_SOLAR.filter((col) => col.onByDefault).map(
  (col) => col.id,
)
const DEFAULT_COLUMNS_JUPITER: ColumnId[] = ['e', 'rotation', 'orbit']
const COLUMNS_STORAGE_KEY_SOLAR = 'solestia.readoutColumns'
const COLUMNS_STORAGE_KEY_JUPITER = 'solestia.readoutColumns.jupiter'

function isColumnId(value: unknown): value is ColumnId {
  return typeof value === 'string' && (COLUMN_IDS as readonly string[]).includes(value)
}

function defaultColumns(): ColumnId[] {
  return isJupiter.value ? DEFAULT_COLUMNS_JUPITER : DEFAULT_COLUMNS_SOLAR
}

function columnsStorageKey(): string {
  return isJupiter.value ? COLUMNS_STORAGE_KEY_JUPITER : COLUMNS_STORAGE_KEY_SOLAR
}

function loadColumns(): Set<ColumnId> {
  const fallback = new Set(defaultColumns())
  try {
    const raw = localStorage.getItem(columnsStorageKey())
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return fallback
    return new Set(parsed.filter(isColumnId))
  } catch {
    return fallback
  }
}

const visibleColumns = ref<Set<ColumnId>>(loadColumns())

function showColumn(id: ColumnId): boolean {
  return visibleColumns.value.has(id)
}

function persistColumns(next: Set<ColumnId>) {
  try {
    localStorage.setItem(columnsStorageKey(), JSON.stringify([...next]))
  } catch {
    // Private mode or quota — the picker still works for the session.
  }
}

function toggleColumn(id: ColumnId) {
  const next = new Set(visibleColumns.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  visibleColumns.value = next
  persistColumns(next)
}

function toggleSettings() {
  columnsOpen.value = false
  settingsOpen.value = !settingsOpen.value
}

function toggleColumns() {
  settingsOpen.value = false
  columnsOpen.value = !columnsOpen.value
}

function menuContains(root: HTMLElement | null, target: EventTarget | null): boolean {
  return target instanceof Node && !!root?.contains(target)
}

function onSettingsDocPointer(event: PointerEvent) {
  const target = event.target
  if (settingsOpen.value && !menuContains(settingsRoot.value, target)) settingsOpen.value = false
  if (columnsOpen.value && !menuContains(columnsRoot.value, target)) columnsOpen.value = false
}

function onSettingsDocKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (!settingsOpen.value && !columnsOpen.value) return
  settingsOpen.value = false
  columnsOpen.value = false
  event.preventDefault()
  event.stopPropagation()
}

onMounted(() => {
  document.addEventListener('pointerdown', onSettingsDocPointer)
  document.addEventListener('keydown', onSettingsDocKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onSettingsDocPointer)
  document.removeEventListener('keydown', onSettingsDocKeydown, true)
})

/** Roughly four significant figures, so column widths stay comparable. */
function formatQuantity(value: number, unit: string): string {
  const digits = value >= 10000 ? 0 : value >= 100 ? 1 : value >= 10 ? 2 : 3
  const number = value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${number} ${unit}`
}

/** Days shown in whichever of days, hours or minutes keeps a leading digit. */
function formatDuration(days: number): string {
  const hours = days * HOURS_PER_DAY
  if (days >= 2) return formatQuantity(days, 'd')
  if (hours >= 2) return formatQuantity(hours, 'h')
  return formatQuantity(hours * 60, 'min')
}

function nextRotationKind(): RotationKind {
  const kinds = rotationKinds.value
  return kinds[(kinds.indexOf(rotationKind.value) + 1) % kinds.length]
}

function toggleRotationKind() {
  chosenRotationKind.value = nextRotationKind()
}

const rotationKindAria = computed(
  () =>
    `Rotation period as ${ROTATION_KIND_WORDS[rotationKind.value]}. ` +
    `Click to show ${ROTATION_KIND_WORDS[nextRotationKind()]}.`,
)

function toggleOrbitUnit() {
  orbitUnit.value = orbitUnit.value === 'earth' ? 'local' : 'earth'
}

function formatEcc(e: number): string {
  if (e >= 0.1) return e.toFixed(4)
  if (e >= 0.01) return e.toFixed(5)
  return e.toFixed(6)
}

function formatDayClock(frac: number): string {
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
function simpleRatio(value: number): string | null {
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

const rings = computed(() => {
  const earthPerihelionLongitude = props.snapshot.earthPerihelionLongitude
  const frameLabel = isJupiterSnapshot(props.snapshot) ? 'IAU' : props.snapshot.rotationFrame
  const last = Math.max(bodies.value.length - 1, 1)
  return bodies.value.map((planet, i) => {
    const r = innerR + (i / last) * (outerR - innerR)
    const body = orbitPoint(cx, cy, r, planet.offsetFromEarthPerihelion)
    const periOffset = wrapRad(planet.perihelionLongitude - earthPerihelionLongitude)
    const periTick = orbitPoint(cx, cy, r, periOffset)
    const periInner = orbitPoint(cx, cy, r - 1.4, periOffset)

    const bodyR = planet.id === 'earth' ? 1.7 : 1.45
    const facingOffset = wrapRad(planet.facing.longitude - earthPerihelionLongitude)
    const facingReach = bodyR + facingGap
    const facingFrom = orbitPoint(body.x, body.y, facingReach, facingOffset)
    const facingTo = orbitPoint(
      body.x,
      body.y,
      facingReach + facingMin + (facingMax - facingMin) * planet.facing.inPlane,
      facingOffset,
    )
    const label =
      `${planet.name} — ${frameLabel} prime meridian faces ` +
      `${formatDeg(planet.facing.longitude)} ecliptic longitude`

    return { planet, r, bodyR, body, periTick, periInner, facingFrom, facingTo, label }
  })
})

const sunMark = computed(() => {
  if (isJupiterSnapshot(props.snapshot)) return null
  const { sun, earthPerihelionLongitude } = props.snapshot
  const offset = wrapRad(sun.facing.longitude - earthPerihelionLongitude)
  const reach = sunR + sunFacingGap
  const from = orbitPoint(cx, cy, reach, offset)
  const to = orbitPoint(
    cx,
    cy,
    reach + sunFacingMin + (sunFacingMax - sunFacingMin) * sun.facing.inPlane,
    offset,
  )
  const label =
    `Sun — Carrington prime meridian faces ${formatDeg(sun.facing.longitude)} ecliptic ` +
    `longitude, one turn every ${sun.siderealRotationDays.toFixed(2)} d. ` +
    `Spin axis tilted ${formatDeg(sun.obliquity)} from ecliptic north`
  return { from, to, label }
})

const jupiterMark = computed(() => {
  if (!isJupiterSnapshot(props.snapshot)) return null
  const { jupiter, earthPerihelionLongitude } = props.snapshot
  const offset = wrapRad(jupiter.facing.longitude - earthPerihelionLongitude)
  const reach = sunR + sunFacingGap
  const from = orbitPoint(cx, cy, reach, offset)
  const to = orbitPoint(
    cx,
    cy,
    reach + sunFacingMin + (sunFacingMax - sunFacingMin) * jupiter.facing.inPlane,
    offset,
  )
  const label = `Jupiter — IAU prime meridian faces ${formatDeg(jupiter.facing.longitude)} ecliptic longitude`
  return { from, to, label, color: jupiter.color }
})

const sunTick = computed(() => {
  if (!isJupiterSnapshot(props.snapshot)) return null
  const offset = props.snapshot.sunOffsetFromEarthPerihelion
  const inner = orbitPoint(cx, cy, innerR - 2, offset)
  const outer = orbitPoint(cx, cy, outerR + 2.2, offset)
  const label = orbitPoint(cx, cy, outerR + 2.2, offset)
  return { inner, outer, label, offset }
})

const upTick = computed(() => {
  if (!isJupiter.value) return null
  return {
    inner: orbitPoint(cx, cy, outerR + 0.4, 0),
    outer: orbitPoint(cx, cy, outerR + 1.6, 0),
  }
})

const viewBoxHeight = size + 2 * padY

/** HTML callout pinned to the selected disc; omitted when that body has no notes. */
const selectionCallout = computed(() => {
  if (!showNotes.value) return null
  const id = props.selectedPlanet
  if (!id) return null
  const paragraphs = SELECTION_NOTES[id as keyof typeof SELECTION_NOTES]
  if (!paragraphs?.length) return null
  const ring = rings.value.find((item) => item.planet.id === id)
  if (!ring) return null
  const { x, y } = ring.body
  return {
    name: ring.planet.name,
    paragraphs,
    left: `${x}%`,
    top: `${((y + padY) / viewBoxHeight) * 100}%`,
    flipLeft: x >= cx,
    flipAbove: y >= cy,
  }
})

/**
 * Roving tabindex: the table is a single tab stop, then the arrow keys walk the
 * rows. The dials and the orrery stay click-only so the same bodies don't turn
 * up three times in the tab order.
 */
const focusedPlanet = ref<string | null>(null)

const tabStopPlanet = computed(
  () => focusedPlanet.value ?? props.selectedPlanet ?? bodies.value[0]?.id ?? null,
)

function focusRow(row: Element | null | undefined) {
  if (row instanceof HTMLElement) row.focus()
}

function onRowKeydown(event: KeyboardEvent, id: string) {
  const row = event.currentTarget as HTMLTableRowElement
  const body = row.parentElement
  if (!body) return

  switch (event.key) {
    case 'ArrowDown':
      focusRow(row.nextElementSibling ?? body.firstElementChild)
      break
    case 'ArrowUp':
      focusRow(row.previousElementSibling ?? body.lastElementChild)
      break
    case 'Home':
      focusRow(body.firstElementChild)
      break
    case 'End':
      focusRow(body.lastElementChild)
      break
    case 'Enter':
    case ' ':
      emit('select', id)
      break
    default:
      return
  }
  event.preventDefault()
}

function onBodyClick(id: string, event: MouseEvent) {
  if (event.detail > 1) return
  emit('select', id)
}

function onBodyDblclick(id: string) {
  if (!isJupiter.value && id === 'jupiter') emit('open')
}

function formatDistance(
  planet: OrreryBody,
  factor: number,
): { primary: string; secondary: string } {
  if (isJupiter.value && 'aKm' in planet) {
    const km = planet.aKm * factor
    return {
      primary: formatQuantity(km, 'km'),
      secondary: formatQuantity(km / JUPITER_RADIUS_KM, 'R_J'),
    }
  }
  const au = planet.a * factor
  return { primary: formatQuantity(au, 'AU'), secondary: '' }
}

const rows = computed(() =>
  bodies.value.map((planet) => {
    const kind = rotationKind.value
    const jupiterDay = 'jupiterDayDays' in planet ? planet.jupiterDayDays : Number.POSITIVE_INFINITY
    const locked = kind === 'jovian' && !Number.isFinite(jupiterDay)
    const rotationDays =
      kind === 'sidereal'
        ? planet.siderealRotationDays
        : kind === 'solar'
          ? planet.solarDayDays
          : jupiterDay
    const localOrbitDays = planet.siderealOrbitDays / rotationDays
    const localUnit = kind === 'sidereal' ? 'sid. d' : kind === 'solar' ? 'sol. d' : 'jov. d'
    const spinOrbit = planet.siderealOrbitDays / planet.siderealRotationDays
    const wobble = eccentricityWobble(planet.e)
    const wobbleTime = formatDuration((wobble / (Math.PI * 2)) * planet.solarDayDays)
    const distA = formatDistance(planet, 1)
    const distQ = formatDistance(planet, 1 - planet.e)
    const distQap = formatDistance(planet, 1 + planet.e)
    return {
      planet,
      eccentricity: formatEcc(planet.e),
      rotation: locked
        ? {
            primary: '∞',
            secondary: '1:1 lock',
            spin:
              `Jupiter never rises or sets here: ${planet.name} spins once per orbit, so Jupiter ` +
              `hangs over the sub-Jupiter point, swinging ±${formatFineDeg(wobble)} once per ` +
              `${formatQuantity(planet.siderealOrbitDays, 'd')} orbit. The far side never sees it.`,
          }
        : {
            primary: formatQuantity(rotationDays * HOURS_PER_DAY, 'h'),
            secondary: formatQuantity(rotationDays, 'd'),
            spin: `Spin axis tilted ${formatDeg(planet.obliquity)} from ecliptic north${
              planet.retrograde ? ' — rotates retrograde' : ''
            }`,
          },
      orbit:
        orbitUnit.value === 'earth'
          ? {
              primary: formatQuantity(planet.siderealOrbitDays, 'd'),
              secondary: isJupiter.value
                ? ''
                : formatQuantity(planet.siderealOrbitDays / JULIAN_YEAR_DAYS, 'yr'),
              note: '',
            }
          : locked
            ? {
                primary: '—',
                secondary: '',
                note: 'With Jupiter fixed in the sky there are no Jupiter days to count. One orbit is exactly one rotation.',
              }
            : {
                primary: formatQuantity(localOrbitDays, localUnit),
                secondary: '',
                note: '',
              },
      libration: isJupiter.value
        ? {
            primary: `±${formatFineDeg(wobble)}`,
            secondary: formatQuantity(planet.siderealOrbitDays, 'd'),
            note:
              `Jupiter swings ±${formatFineDeg(wobble)} east and west of the sub-Jupiter point, ` +
              `once per orbit. The spin is uniform but an eccentric orbit is not, which is ` +
              `optical libration — the same effect that shows Earth a little around each limb of the Moon.`,
          }
        : {
            primary: `±${formatFineDeg(wobble)}`,
            secondary: `±${wobbleTime}`,
            note:
              `Apparent solar time runs up to ${wobbleTime} ahead of and behind a uniform clock, ` +
              `because an eccentric orbit carries the Sun across the sky unevenly. This is the ` +
              `eccentricity term of the equation of time; the obliquity term is left out.`,
          },
      day: {
        primary: `${(planet.dayFraction * 100).toFixed(1)}%`,
        secondary: formatDayClock(planet.dayFraction),
      },
      resonance: {
        primary: spinOrbit.toFixed(3),
        secondary: simpleRatio(spinOrbit),
      },
      a: distA.primary,
      aSecondary: distA.secondary,
      q: distQ.primary,
      qSecondary: distQ.secondary,
      Q: distQap.primary,
      QSecondary: distQap.secondary,
    }
  }),
)
</script>

<template>
  <div class="orrery">
    <div class="orrery__diagram">
      <div ref="settingsRoot" class="orrery__settings">
        <button
          type="button"
          class="orrery__settings-btn"
          :aria-expanded="settingsOpen"
          aria-controls="orrery-settings"
          aria-haspopup="true"
          aria-label="Orrery settings"
          @click="toggleSettings"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z"
            />
          </svg>
        </button>
        <Transition name="settings-menu">
          <div
            v-show="settingsOpen"
            id="orrery-settings"
            class="orrery__settings-menu"
            aria-labelledby="orrery-settings-title"
          >
            <p id="orrery-settings-title" class="orrery__settings-title">Display</p>
            <label class="orrery__settings-item">
              <input v-model="showFacing" type="checkbox" />
              {{ isJupiter ? 'Moon facing' : 'Planet facing' }}
            </label>
            <label class="orrery__settings-item">
              <input v-model="showSunFacing" type="checkbox" />
              {{ isJupiter ? 'Jupiter facing' : 'Sun facing' }}
            </label>
            <label class="orrery__settings-item">
              <input v-model="showPerihelion" type="checkbox" />
              {{ isJupiter ? 'Perijove' : 'Perihelion' }}
            </label>
            <label class="orrery__settings-item">
              <input v-model="showNotes" type="checkbox" />
              Oddity Notes
            </label>
          </div>
        </Transition>
      </div>
      <svg
        class="orrery__svg"
        :viewBox="viewBox"
        role="img"
        :aria-label="
          isJupiter
            ? 'Jupiter system orrery with evenly spaced Galilean orbits, Earth perihelion at the top'
            : 'Solar system orrery with evenly spaced orbits, Earth perihelion at the top'
        "
      >
        <title>
          {{
            isJupiter
              ? live
                ? 'Jupiter system now'
                : `Jupiter system at ${snapshot.at.toISOString()}`
              : live
                ? 'Solar system now'
                : `Solar system at ${snapshot.at.toISOString()}`
          }}
        </title>
        <desc>
          {{
            isJupiter
              ? 'Concentric rings for Io through Callisto. Earth’s perihelion is at the top. The Sun is marked at the anti-Jupiter direction. Each moon’s whisker shows where its IAU prime meridian points; longitude 0 faces Jupiter.'
              : 'Concentric rings for Mercury through Neptune. Earth’s perihelion is at the top, aphelion at the bottom. Planets sit at their heliocentric longitude for the selected time, each with a short whisker showing where its prime meridian points in the selected longitude system. The Sun at the center carries the same whisker for its Carrington prime meridian.'
          }}
        </desc>
        <line class="axis" :x1="cx" :y1="cy - outerR - 1" :x2="cx" :y2="cy + outerR + 1" />
        <template v-if="!isJupiter">
          <text class="axis-label" :x="perihelionMark.x" :y="perihelionMark.y" text-anchor="middle">
            ⊕
            <tspan baseline-shift="sub" font-size="0.75em">peri</tspan>
            <title>Perihelion - Nearest Point to the Sun</title>
          </text>
          <text
            class="axis-label"
            :x="aphelionMark.x"
            :y="aphelionMark.y + 2.2"
            text-anchor="middle"
          >
            ⊕
            <tspan baseline-shift="sub" font-size="0.75em">aph</tspan>
            <title>Aphelion - Farthest Point from the Sun</title>
          </text>
        </template>
        <template v-else>
          <line
            v-if="upTick"
            class="peri-tick"
            :x1="upTick.inner.x"
            :y1="upTick.inner.y"
            :x2="upTick.outer.x"
            :y2="upTick.outer.y"
          >
            <title>Earth perihelion direction (diagram up)</title>
          </line>
          <g v-if="sunTick">
            <line
              class="sun-ray"
              :x1="sunTick.inner.x"
              :y1="sunTick.inner.y"
              :x2="sunTick.outer.x"
              :y2="sunTick.outer.y"
            />
            <text class="axis-label" :x="sunTick.label.x" :y="sunTick.label.y" text-anchor="middle">
              ☉
              <title>Direction of the Sun from Jupiter</title>
            </text>
          </g>
        </template>
        <g
          v-for="ring in rings"
          :key="ring.planet.id"
          :class="{ 'satellite-group': true, selected: selectedPlanet === ring.planet.id }"
          @click="onBodyClick(ring.planet.id, $event)"
          @dblclick="onBodyDblclick(ring.planet.id)"
        >
          <title>{{ ring.label }}</title>
          <circle class="orbit" :cx="cx" :cy="cy" :r="ring.r" />
          <line
            v-if="showPerihelion"
            class="peri-tick"
            :x1="ring.periInner.x"
            :y1="ring.periInner.y"
            :x2="ring.periTick.x"
            :y2="ring.periTick.y"
          />
          <circle
            class="body"
            :cx="ring.body.x"
            :cy="ring.body.y"
            :r="ring.bodyR"
            :fill="ring.planet.color"
          />
          <line
            v-if="showFacing"
            class="facing"
            :x1="ring.facingFrom.x"
            :y1="ring.facingFrom.y"
            :x2="ring.facingTo.x"
            :y2="ring.facingTo.y"
            :stroke="ring.planet.color"
          />
        </g>
        <g v-if="sunMark" class="sun-mark">
          <title>{{ sunMark.label }}</title>
          <circle class="sun" :cx="cx" :cy="cy" :r="sunR" />
          <line
            v-if="showSunFacing"
            class="sun-facing"
            :x1="sunMark.from.x"
            :y1="sunMark.from.y"
            :x2="sunMark.to.x"
            :y2="sunMark.to.y"
          />
        </g>
        <g v-else-if="jupiterMark" class="sun-mark">
          <title>{{ jupiterMark.label }}</title>
          <circle class="planet-center" :cx="cx" :cy="cy" :r="sunR" :fill="jupiterMark.color" />
          <line
            v-if="showSunFacing"
            class="planet-center-facing"
            :x1="jupiterMark.from.x"
            :y1="jupiterMark.from.y"
            :x2="jupiterMark.to.x"
            :y2="jupiterMark.to.y"
            :style="{ stroke: jupiterMark.color }"
          />
        </g>
      </svg>
      <aside
        v-if="selectionCallout"
        class="orrery__note"
        :class="{
          'orrery__note--left': selectionCallout.flipLeft,
          'orrery__note--above': selectionCallout.flipAbove,
        }"
        :style="{ left: selectionCallout.left, top: selectionCallout.top }"
        role="note"
        :aria-label="`Notes for ${selectionCallout.name}`"
      >
        <p class="orrery__note-title">{{ selectionCallout.name }}</p>
        <p v-for="(paragraph, i) in selectionCallout.paragraphs" :key="i">{{ paragraph }}</p>
      </aside>
    </div>

    <div class="readout-block">
      <div class="readout__caption">
        <span class="readout__caption-title">Orbit data</span>
        <span class="help">
          <button
            type="button"
            class="help__btn"
            aria-describedby="orbit-help"
            aria-label="About table symbols"
          >
            i
          </button>
          <div v-if="!isJupiter" id="orbit-help" role="tooltip" class="help__panel">
            <p>
              <strong>e</strong> is orbital eccentricity — 0 is a circle, Mercury’s ~0.206 is the
              most stretched among the planets.
            </p>
            <p>
              <strong>ε</strong> (epsilon) is obliquity — the tilt of the spin axis from ecliptic
              north. Over 90° means the body rotates retrograde.
            </p>
            <p>
              <strong>λ</strong> (lambda) is heliocentric ecliptic longitude — the planet’s angular
              position around the Sun, measured along the ecliptic from the J2000 vernal equinox.
            </p>
            <p>
              <strong>ν</strong> (nu) is the true anomaly — the angle at the Sun between the planet
              and its perihelion.
            </p>
            <p>
              <strong>i</strong> is orbital inclination to the ecliptic of J2000.
              <strong>W<sub>0</sub></strong> is the prime-meridian angle at J2000 in the longitude
              system chosen at the top of the page. <strong>rot</strong> is how far the selected
              meridian has come through its solar day (0% at local midnight).
              <strong>P<sub>orb</sub>/P<sub>rot</sub></strong> is sidereal orbits per spin; a nearby
              small integer ratio is shown when the match is close (Mercury 3:2).
              <strong>a</strong>, <strong>q</strong>, and <strong>Q</strong> are mean, perihelion,
              and aphelion distances in AU.
            </p>
            <p>
              <strong>P<sub>rot</sub></strong> is the rotation period in the longitude system chosen
              at the top of the page (IAU cartographic W, magnetic System III, or cloud features).
              Inner planets have only the IAU frame, so magnetic and cloud leave them unchanged.
              Click the heading to switch between a sidereal day (one spin relative to the stars)
              and a solar day (noon to noon). Hover a value for that planet’s axial tilt. The
              whisker on each planet above points where that meridian faces; it shortens as the
              meridian tips out of the ecliptic plane and away from the viewer. The Sun carries one
              too, on the Carrington rate of 25.38 days — a convention rather than a rigid period,
              since the photosphere spins faster at the equator than near the poles.
            </p>
            <p>
              <strong>P<sub>orb</sub></strong> is the sidereal orbital period — one revolution
              around the Sun relative to the stars. Click the heading to express it in Earth days
              and years, or in that planet’s own days (sidereal or solar, matching P<sub>rot</sub>).
            </p>
            <p>
              <strong>eot</strong> is the equation of time: how far apparent solar time runs ahead
              of and behind a uniform clock, because an eccentric orbit carries the Sun across the
              sky unevenly. The swing is ±2e radians of rotation, ±7.66 min for Earth but ±11.5 days
              for Mercury — which is why Mercury’s hand above creeps backwards near perihelion. The
              obliquity term, which splits the year in two, is left out.
            </p>
          </div>
          <div v-else id="orbit-help" role="tooltip" class="help__panel">
            <p>
              <strong>e</strong> is orbital eccentricity in the local Laplace plane. The Galilean
              moons are nearly circular.
            </p>
            <p>
              <strong>λ</strong> is planetocentric ecliptic longitude — the moon’s angular position
              around Jupiter, measured in the same Earth-perihelion frame as the solar-system
              orrery. <strong>ν</strong> is the true anomaly from perijove.
            </p>
            <p>
              <strong>i</strong> is inclination to the local Laplace plane, not the ecliptic.
              <strong>a</strong>, <strong>q</strong>, and <strong>Q</strong> are mean, perijove, and
              apojove distances in km and Jupiter radii.
            </p>
            <p>
              <strong>P<sub>rot</sub></strong> is the IAU sidereal spin. Click the heading for the
              solar day — noon to noon for the Sun, not Jupiter — and again for the Jupiter day, the
              time for Jupiter to stand on the same meridian again. That one reads ∞: all four moons
              spin once per orbit, so <strong>P<sub>orb</sub>/P<sub>rot</sub></strong> is 1 and
              Jupiter never leaves its spot in the sky. One hemisphere always faces it and the other
              never sees it at all.
            </p>
            <p>
              <strong>lib</strong> is the wobble around that spot. The spin is uniform but an
              eccentric orbit is not, so Jupiter swings east and west by ±2e radians — ±0.46° for
              Io, ±1.03° for Europa — once per orbit. Positions use JPL mean elements and will
              slowly drift from the Laplace 4:2:1 resonance.
            </p>
          </div>
        </span>
        <div ref="columnsRoot" class="readout__columns">
          <button
            type="button"
            class="readout__columns-btn"
            :aria-expanded="columnsOpen"
            aria-controls="readout-columns"
            aria-haspopup="true"
            aria-label="Table columns"
            @click="toggleColumns"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M3 5h4v14H3V5Zm7 0h4v14h-4V5Zm7 0h4v14h-4V5Z" />
            </svg>
          </button>
          <Transition name="settings-menu">
            <div
              v-show="columnsOpen"
              id="readout-columns"
              class="orrery__settings-menu readout__columns-menu"
              aria-labelledby="readout-columns-title"
            >
              <p id="readout-columns-title" class="orrery__settings-title">Columns</p>
              <label v-for="col in COLUMN_CATALOG" :key="col.id" class="orrery__settings-item">
                <input
                  type="checkbox"
                  :checked="showColumn(col.id)"
                  @change="toggleColumn(col.id)"
                />
                {{ col.label }}
              </label>
            </div>
          </Transition>
        </div>
      </div>
      <div class="readout-scroll">
        <table class="readout">
          <caption class="readout__sr">
            Orbit data
          </caption>
          <thead>
            <tr>
              <th scope="col" class="readout__planet">{{ isJupiter ? 'Moon' : 'Planet' }}</th>
              <th v-if="showColumn('e')" scope="col" title="Orbital eccentricity">e</th>
              <th v-if="showColumn('obliquity')" scope="col" title="Obliquity">ε</th>
              <th v-if="showColumn('rotation')" scope="col" title="Rotation period">
                <button
                  type="button"
                  class="th-toggle"
                  :aria-label="rotationKindAria"
                  @click="toggleRotationKind"
                >
                  <span class="th-sym">P<sub>rot</sub></span>
                  <span class="th-mode">{{ rotationKind }}</span>
                </button>
              </th>
              <th v-if="showColumn('orbit')" scope="col" title="Orbital period">
                <button
                  type="button"
                  class="th-toggle"
                  :aria-label="
                    orbitUnit === 'earth'
                      ? isJupiter
                        ? 'Orbital period in Earth days. Click to show the moon’s own days.'
                        : 'Orbital period in Earth days and years. Click to show the planet’s own days.'
                      : isJupiter
                        ? 'Orbital period in the moon’s own days. Click to show Earth days.'
                        : 'Orbital period in the planet’s own days. Click to show Earth days and years.'
                  "
                  @click="toggleOrbitUnit"
                >
                  <span class="th-sym">P<sub>orb</sub></span>
                  <span class="th-mode">{{ orbitUnit === 'earth' ? 'Earth d' : 'own days' }}</span>
                </button>
              </th>
              <th
                v-if="showColumn('longitude')"
                scope="col"
                title="Heliocentric ecliptic longitude"
              >
                λ
              </th>
              <th v-if="showColumn('anomaly')" scope="col" title="True anomaly">ν</th>
              <th v-if="showColumn('inclination')" scope="col" title="Orbital inclination">i</th>
              <th v-if="showColumn('day')" scope="col">rot</th>
              <th
                v-if="showColumn('libration')"
                scope="col"
                :title="
                  isJupiter
                    ? 'Libration of Jupiter about the sub-Jupiter point'
                    : 'Equation of time, eccentricity term'
                "
              >
                {{ isJupiter ? 'lib' : 'eot' }}
              </th>
              <th v-if="showColumn('w0')" scope="col" title="Prime-meridian angle">
                W<sub>0</sub>
              </th>
              <th v-if="showColumn('resonance')" scope="col">P<sub>orb</sub>/P<sub>rot</sub></th>
              <th v-if="showColumn('a')" scope="col" title="Mean distance">a</th>
              <th v-if="showColumn('q')" scope="col" title="Perihelion distance">q</th>
              <th v-if="showColumn('Q')" scope="col" title="Aphelion distance">Q</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.planet.id"
              :class="{ selected: selectedPlanet === row.planet.id }"
              :tabindex="tabStopPlanet === row.planet.id ? 0 : -1"
              :aria-current="selectedPlanet === row.planet.id ? 'true' : undefined"
              @click="onBodyClick(row.planet.id, $event)"
              @dblclick="onBodyDblclick(row.planet.id)"
              @focus="focusedPlanet = row.planet.id"
              @keydown="onRowKeydown($event, row.planet.id)"
            >
              <th scope="row" class="readout__planet">
                <span class="swatch" :style="{ background: row.planet.color }"></span>
                {{ row.planet.name }}
              </th>
              <td v-if="showColumn('e')">
                <span class="pair">{{ row.eccentricity }}</span>
              </td>
              <td v-if="showColumn('obliquity')" :title="row.rotation.spin">
                <span class="pair">{{ formatDeg(row.planet.obliquity) }}</span>
                <span class="pair pair--dim">{{ formatRad(row.planet.obliquity) }}</span>
              </td>
              <td v-if="showColumn('rotation')" :title="row.rotation.spin">
                <span class="pair">{{ row.rotation.primary }}</span>
                <span class="pair pair--dim">{{ row.rotation.secondary }}</span>
              </td>
              <td v-if="showColumn('orbit')" :title="row.orbit.note || undefined">
                <span class="pair">{{ row.orbit.primary }}</span>
                <span v-if="row.orbit.secondary" class="pair pair--dim">{{
                  row.orbit.secondary
                }}</span>
              </td>
              <td v-if="showColumn('longitude')">
                <span class="pair">{{ formatDeg(row.planet.longitude) }}</span>
                <span class="pair pair--dim">{{ formatRad(row.planet.longitude) }}</span>
              </td>
              <td v-if="showColumn('anomaly')">
                <span class="pair">{{ formatDeg(row.planet.trueAnomaly) }}</span>
                <span class="pair pair--dim">{{ formatRad(row.planet.trueAnomaly) }}</span>
              </td>
              <td v-if="showColumn('inclination')">
                <span class="pair">{{ formatDeg(row.planet.inclination) }}</span>
                <span class="pair pair--dim">{{ formatRad(row.planet.inclination) }}</span>
              </td>
              <td v-if="showColumn('day')">
                <span class="pair">{{ row.day.primary }}</span>
                <span class="pair pair--dim">{{ row.day.secondary }}</span>
              </td>
              <td v-if="showColumn('libration')" :title="row.libration.note">
                <span class="pair">{{ row.libration.primary }}</span>
                <span class="pair pair--dim">{{ row.libration.secondary }}</span>
              </td>
              <td v-if="showColumn('w0')">
                <span class="pair">{{ formatDeg(row.planet.w0) }}</span>
                <span class="pair pair--dim">{{ formatRad(row.planet.w0) }}</span>
              </td>
              <td v-if="showColumn('resonance')">
                <span class="pair">{{ row.resonance.primary }}</span>
                <span v-if="row.resonance.secondary" class="pair pair--dim">{{
                  row.resonance.secondary
                }}</span>
              </td>
              <td v-if="showColumn('a')">
                <span class="pair">{{ row.a }}</span>
                <span v-if="row.aSecondary" class="pair pair--dim">{{ row.aSecondary }}</span>
              </td>
              <td v-if="showColumn('q')">
                <span class="pair">{{ row.q }}</span>
                <span v-if="row.qSecondary" class="pair pair--dim">{{ row.qSecondary }}</span>
              </td>
              <td v-if="showColumn('Q')">
                <span class="pair">{{ row.Q }}</span>
                <span v-if="row.QSecondary" class="pair pair--dim">{{ row.QSecondary }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.orrery {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.orrery__diagram {
  position: relative;
}

.orrery__note {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  box-sizing: border-box;
  width: min(18.5rem, 70%);
  max-height: min(12rem, 45%);
  overflow: auto;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  background: var(--bg-raised);
  box-shadow: 0 0.5rem 1.25rem rgb(0 0 0 / 35%);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  transform: translate(0.45rem, 0.45rem);
}

.orrery__note--left {
  transform: translate(calc(-100% - 0.45rem), 0.45rem);
}

.orrery__note--above {
  transform: translate(0.45rem, calc(-100% - 0.45rem));
}

.orrery__note--left.orrery__note--above {
  transform: translate(calc(-100% - 0.45rem), calc(-100% - 0.45rem));
}

.orrery__note p {
  margin: 0 0 0.55rem;
}

.orrery__note p:last-child {
  margin-bottom: 0;
}

.orrery__note-title {
  margin: 0 0 0.4rem;
  font-weight: 600;
}

.orrery__settings {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
}

.orrery__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-raised) 85%, transparent);
  color: $color-text-muted;
  cursor: pointer;
  transition:
    color 120ms ease,
    border-color 120ms ease;
}

.orrery__settings-btn svg {
  width: 0.95rem;
  height: 0.95rem;
  transition: transform 250ms ease;
}

.orrery__settings-btn:hover,
.orrery__settings-btn:focus-visible,
.orrery__settings-btn[aria-expanded='true'] {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  outline: none;
}

.orrery__settings-btn:hover svg,
.orrery__settings-btn[aria-expanded='true'] svg {
  transform: rotate(45deg);
}

.orrery__settings-menu {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  min-width: 10.5rem;
  padding: 0.3rem;
  border: 1px solid var(--border);
  border-radius: $radius-md;
  background: color-mix(in srgb, var(--bg-raised) 94%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: 0 0.75rem 1.75rem rgb(0 0 0 / 45%);
  transform-origin: top right;
}

.orrery__settings-title {
  margin: 0;
  padding: 0.25rem 0.5rem 0.35rem;
  color: $color-text-muted;
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.orrery__settings-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: $radius-sm;
  color: $color-text-muted;
  font-size: 0.75rem;
  line-height: 1.3;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.orrery__settings-item:hover,
.orrery__settings-item:focus-within {
  background: color-mix(in srgb, var(--border) 40%, transparent);
  color: var(--text);
}

.orrery__settings-item:has(input:checked) {
  color: var(--text);
}

.orrery__settings-item input {
  appearance: none;
  display: grid;
  place-content: center;
  flex: none;
  width: 0.85rem;
  height: 0.85rem;
  margin: 0;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

// Checkmark scaled to nothing while unchecked, so only the transform animates.
.orrery__settings-item input::after {
  content: '';
  width: 0.55rem;
  height: 0.55rem;
  background: var(--bg);
  clip-path: polygon(14% 44%, 0 65%, 40% 100%, 100% 16%, 84% 0%, 38% 68%);
  transform: scale(0);
  transition: transform 120ms ease;
}

.orrery__settings-item input:checked {
  border-color: var(--accent);
  background: var(--accent);
}

.orrery__settings-item input:checked::after {
  transform: scale(1);
}

.orrery__settings-item input:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
  outline-offset: 2px;
}

.settings-menu-enter-active,
.settings-menu-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.settings-menu-enter-from,
.settings-menu-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-0.15rem);
}

@media (prefers-reduced-motion: reduce) {
  .orrery__settings-btn svg,
  .orrery__settings-item input,
  .orrery__settings-item input::after,
  .settings-menu-enter-active,
  .settings-menu-leave-active {
    transition: none;
  }

  .orrery__settings-btn:hover svg,
  .orrery__settings-btn[aria-expanded='true'] svg {
    transform: none;
  }
}

.orrery__svg {
  width: 100%;
  height: auto;
  display: block;

  // The Sun is the frame of reference, not a selectable body, so it neither
  // offers a pointer nor dims behind a selection.
  g.satellite-group {
    cursor: pointer;

    &:hover {
      opacity: 0.6;
    }

    &.selected:hover {
      opacity: 0.8;
    }
  }

  &:has(g.satellite-group.selected) {
    g.satellite-group:not(.selected):not(:hover) {
      opacity: 0.4;
    }
  }
}

.orbit {
  fill: none;
  stroke: var(--border);
  stroke-width: 0.35;
}

.axis {
  stroke: color-mix(in srgb, var(--text-dim) 45%, transparent);
  stroke-width: 0.25;
  stroke-dasharray: 1 1.2;
}

.axis-label {
  fill: var(--text-dim);
  font-size: 2.4px;
  font-family: $font-sans;
}

.peri-tick {
  stroke: color-mix(in srgb, var(--accent) 55%, transparent);
  stroke-width: 0.35;
}

.facing {
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.55;

  g.selected & {
    opacity: 0.95;
  }
}

.sun {
  fill: var(--accent);
}

.planet-center-facing,
.sun-facing {
  stroke: var(--accent);
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.7;
}

.sun-ray {
  stroke: color-mix(in srgb, var(--accent) 55%, transparent);
  stroke-width: 0.25;
  stroke-dasharray: 0.6 0.7;
}

.readout-block {
  min-width: 0;
}

.readout-scroll {
  overflow-x: auto;
  width: 100%;
}

.readout {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.readout__caption {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: $spacing-sm;
  font-weight: 600;
}

.readout__caption-title {
  font-weight: 600;
}

.readout__columns {
  position: relative;
  flex: none;
  margin-left: auto;
}

.readout__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.readout__columns {
  position: relative;
  flex: none;
}

.readout__columns-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-raised) 85%, transparent);
  color: $color-text-muted;
  cursor: pointer;
  transition:
    color 120ms ease,
    border-color 120ms ease;
}

.readout__columns-btn svg {
  width: 0.9rem;
  height: 0.9rem;
}

.readout__columns-btn:hover,
.readout__columns-btn:focus-visible,
.readout__columns-btn[aria-expanded='true'] {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  outline: none;
}

.readout__columns-menu {
  z-index: 3;
  max-height: min(22rem, 70vh);
  overflow-y: auto;
}

.help {
  position: relative;
  display: inline-block;
  margin-left: 0.35rem;
  font-weight: 400;
  vertical-align: middle;
}

.help__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: transparent;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.7rem;
  font-style: italic;
  line-height: 1;
  cursor: help;
}

.help__btn:hover,
.help__btn:focus-visible {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  outline: none;
}

.help__panel {
  display: none;
  overflow: auto;
  position: absolute;
  z-index: 2;
  top: 100%;
  left: 0;
  width: min(18.5rem, 70vw);
  max-height: 350px;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  background: var(--bg-raised);
  box-shadow: 0 0.5rem 1.25rem rgb(0 0 0 / 35%);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
}

.help__panel p {
  margin: 0 0 0.55rem;
}

.help__panel p:last-child {
  margin-bottom: 0;
}

.help:hover .help__panel,
.help:focus-within .help__panel {
  display: block;
}

.th-toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.th-toggle:hover .th-mode,
.th-toggle:focus-visible {
  color: var(--text);
}

.th-toggle:focus-visible {
  outline: none;
}

.th-mode {
  font-size: 0.65rem;
  font-weight: 400;
  letter-spacing: 0.01em;
}

.th-sym sub {
  font-size: 0.65em;
}

th,
td {
  padding: 0.4rem 0.35rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

td {
  min-width: 4.5rem;
}

tbody tr:last-child {
  th,
  td {
    border-bottom-color: transparent;
  }
}

$sticky-fade: 0.4rem 0 0.55rem -0.35rem var(--bg);

.readout__planet {
  position: sticky;
  left: 0;
  z-index: 1;
  padding-right: 20px;
  background: linear-gradient(to right, var(--bg) 85%, transparent 100%);
  box-shadow: $sticky-fade;
}

thead .readout__planet {
  z-index: 2;
}

thead th {
  color: $color-text-muted;
  font-weight: 500;
  font-size: 0.75rem;
}

tbody th {
  font-weight: 500;
  white-space: nowrap;
}

/* The sticky planet cell paints its own background, so a glow drawn on the row
   is buried under that first column. Build the row glow out of per-cell shadows
   instead: every cell lights its top and bottom edge, and the end cells add the
   row's left and right edges. Safari also needs this — it does not treat a
   relatively positioned `tr` as the containing block for an overlay. */
@mixin row-glow($color, $reach: 0.9rem, $blur: 1rem) {
  > * {
    box-shadow:
      inset 0 $reach $blur (-$reach) $color,
      inset 0 (-$reach) $blur (-$reach) $color;
  }

  > .readout__planet {
    box-shadow:
      $sticky-fade,
      inset 0 $reach $blur (-$reach) $color,
      inset 0 (-$reach) $blur (-$reach) $color,
      inset $reach 0 $blur (-$reach) $color;
  }

  > *:last-child:not(.readout__planet) {
    box-shadow:
      inset 0 $reach $blur (-$reach) $color,
      inset 0 (-$reach) $blur (-$reach) $color,
      inset (-$reach) 0 $blur (-$reach) $color;
  }
}

tbody tr {
  cursor: pointer;

  th,
  td {
    transition: box-shadow 120ms ease;
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: -1px;
  }

  &:hover {
    @include row-glow(var(--border));
  }

  &.selected {
    @include row-glow(var(--border-strong));
  }

  &.selected:hover {
    @include row-glow(var(--border-strong), 1.15rem, 1.25rem);
  }
}

.swatch {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  margin-right: 0.4rem;
  vertical-align: middle;
}

.pair {
  display: block;
}

.pair--dim {
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: 0.7rem;
}
</style>
