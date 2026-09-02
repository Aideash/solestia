<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { PLANET_SYSTEM_BANDS, SOLAR_SYSTEM_BANDS } from '../data/orbitalBands.ts'
import { PLANET_SYSTEMS, planetSystemFor, type ViewPlane } from '../data/planetSystems.ts'
import { timePageFor } from '../data/timePages.ts'
import { SELECTION_NOTES, primeMeridianLabel } from '../data/selectionNotes.ts'
import {
  formatDayClock,
  formatDeg,
  formatDuration,
  formatEcc,
  formatFineDeg,
  formatHeliocentricDistance,
  formatQuantity,
  formatRad,
  simpleRatio,
  HOURS_PER_DAY,
  JULIAN_YEAR_DAYS,
  type DistanceUnit,
} from '../lib/format.ts'
import {
  eccentricityWobble,
  edgeOnWhisker,
  keplerOrbitPositions,
  orbitPoint,
  projectEdgeOn,
  projectEclipticTopDown,
  satelliteRelativeOrbitPositions,
  splitClosedByDepth,
  wrapRad,
  type Facing,
  type PlanetSystemSnapshot,
  type PlanetState,
  type SatelliteState,
  type SolarSystemSnapshot,
} from '../lib/kepler.ts'
import { resolveOrbitalBands, resolveSolarOrbitalBands } from '../lib/orbitalBands.ts'
import { radialScale, solarOrbitOuterR, type OrbitExtent } from '../lib/radialScale.ts'
import type { ReadoutCell, ReadoutColumn, ReadoutNavigation, ReadoutRow } from '../lib/readout.ts'
import BodyReadout from './BodyReadout.vue'

const props = defineProps<{
  snapshot: SolarSystemSnapshot | PlanetSystemSnapshot
  selectedPlanet?: string | null
  viewPlane?: ViewPlane
  live?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  open: [id: string]
}>()

function isPlanetSystemSnapshot(
  snapshot: SolarSystemSnapshot | PlanetSystemSnapshot,
): snapshot is PlanetSystemSnapshot {
  return 'satellites' in snapshot
}

type OrreryBody = PlanetState | SatelliteState

const bodies = computed((): OrreryBody[] =>
  isPlanetSystemSnapshot(props.snapshot) ? props.snapshot.satellites : props.snapshot.planets,
)
const isSatelliteSystem = computed(() => isPlanetSystemSnapshot(props.snapshot))
const planetSystem = computed(() =>
  isPlanetSystemSnapshot(props.snapshot) ? PLANET_SYSTEMS[props.snapshot.system] : null,
)
const useEquator = computed(
  () =>
    isSatelliteSystem.value &&
    (props.viewPlane ?? planetSystem.value?.defaultViewPlane) === 'equator',
)
const useEdge = computed(() => props.viewPlane === 'edge')
const useProjectedCamera = computed(() => !useEquator.value)

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

/**
 * The orbit in polar form about the focus, every sample carried through the
 * shared radial scale so the curve, the body, and the periapsis tick agree.
 */
function orbitPath(
  orbit: OrbitExtent,
  periapsisOffset: number,
  scale: (distance: number) => number,
): string {
  const semiLatusRectum = orbit.a * (1 - orbit.e * orbit.e)
  const points = Array.from({ length: 97 }, (_, index) => {
    const nu = (index / 96) * Math.PI * 2
    const distance = semiLatusRectum / (1 + orbit.e * Math.cos(nu))
    return orbitPoint(cx, cy, scale(distance), periapsisOffset + nu)
  })
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .concat('Z')
    .join(' ')
}

type RotationKind = 'sidereal' | 'solar' | 'parent'
type OrbitUnit = 'earth' | 'local'

/** A parent day is meaningful only for a natural satellite. */
const ROTATION_KINDS_SOLAR: RotationKind[] = ['sidereal', 'solar']
const ROTATION_KINDS_SATELLITE: RotationKind[] = ['sidereal', 'solar', 'parent']

const rotationKindWords = computed<Record<RotationKind, string>>(() => ({
  sidereal: 'a sidereal day, one spin against the stars',
  solar: 'a solar day, noon to noon',
  parent: `a ${planetSystem.value?.name ?? 'parent'} day, until the parent stands on the same meridian again`,
}))

const chosenRotationKind = ref<RotationKind>('sidereal')
const orbitUnit = ref<OrbitUnit>('earth')
const distanceUnit = ref<DistanceUnit>('AU')

const rotationKinds = computed(() =>
  isSatelliteSystem.value ? ROTATION_KINDS_SATELLITE : ROTATION_KINDS_SOLAR,
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

const COLUMN_CATALOG_SOLAR: ReadoutColumn[] = [
  {
    id: 'e',
    heading: 'e',
    label: 'Eccentricity (e)',
    title: 'Orbital eccentricity',
    onByDefault: true,
  },
  { id: 'obliquity', heading: 'ε', label: 'Obliquity (ε)', title: 'Obliquity', onByDefault: true },
  {
    id: 'rotation',
    heading: 'P_rot',
    label: 'Rotation period',
    title: 'Rotation period',
    onByDefault: true,
  },
  {
    id: 'orbit',
    heading: 'P_orb',
    label: 'Orbital period',
    title: 'Orbital period',
    onByDefault: true,
  },
  {
    id: 'longitude',
    heading: 'λ',
    label: 'Longitude (λ)',
    title: 'Heliocentric ecliptic longitude',
    onByDefault: false,
  },
  {
    id: 'anomaly',
    heading: 'ν',
    label: 'True anomaly (ν)',
    title: 'True anomaly',
    onByDefault: false,
  },
  {
    id: 'inclination',
    heading: 'i',
    label: 'Orbital inclination (i)',
    title: 'Orbital inclination',
    onByDefault: false,
  },
  {
    id: 'day',
    heading: 'rot',
    label: 'Rotation progress',
    title: 'Progress through the solar day',
    onByDefault: false,
  },
  {
    id: 'libration',
    heading: 'eot',
    label: 'Equation of time (eot)',
    title: 'Equation of time, eccentricity term',
    onByDefault: false,
  },
  {
    id: 'w0',
    heading: 'W₀',
    label: 'Prime meridian at J2000 (W₀)',
    title: 'Prime-meridian angle',
    onByDefault: false,
  },
  {
    id: 'resonance',
    heading: 'P_orb/P_rot',
    label: 'Spin–orbit ratio',
    title: 'Sidereal orbits per spin',
    onByDefault: false,
  },
  {
    id: 'r',
    heading: 'r',
    label: 'Current distance (r)',
    title: 'Current heliocentric distance',
    onByDefault: true,
  },
  { id: 'a', heading: 'a', label: 'Mean distance (a)', title: 'Mean distance', onByDefault: false },
  {
    id: 'q',
    heading: 'q',
    label: 'Perihelion distance (q)',
    title: 'Perihelion distance',
    onByDefault: false,
  },
  {
    id: 'Q',
    heading: 'Q',
    label: 'Aphelion distance (Q)',
    title: 'Aphelion distance',
    onByDefault: false,
  },
]

/** The same columns, reworded for a moon and with a leaner default set. */
const COLUMN_CATALOG_SATELLITE = computed((): ReadoutColumn[] => {
  const system = planetSystem.value
  const overrides: Record<string, Partial<ReadoutColumn>> = {
    obliquity: { onByDefault: false },
    longitude: {
      label: 'Planetocentric longitude (λ)',
      title: `Longitude around ${system?.name ?? 'the parent'}`,
    },
    anomaly: { title: `True anomaly from ${system?.periapsisName ?? 'periapsis'}` },
    inclination: {
      label: 'Inclination to the Laplace plane (i)',
      title: `Inclination to ${system?.orbitPlaneName ?? 'the Laplace plane'}`,
    },
    libration: {
      heading: 'lib',
      label: 'Optical libration (lib)',
      title: `Libration of ${system?.name ?? 'the parent'} about the sub-parent point`,
    },
    r: {
      title: `Current distance from ${system?.name ?? 'the parent'}`,
    },
    q: {
      label: `${capitalize(system?.periapsisName)} distance (q)`,
      title: `${capitalize(system?.periapsisName)} distance`,
    },
    Q: {
      label: `${capitalize(system?.apoapsisName)} distance (Q)`,
      title: `${capitalize(system?.apoapsisName)} distance`,
    },
  }
  return COLUMN_CATALOG_SOLAR.map((column) => ({ ...column, ...overrides[column.id] }))
})

function capitalize(word: string | undefined): string {
  return word ? word[0].toUpperCase() + word.slice(1) : 'Periapsis'
}

const columns = computed(() =>
  isSatelliteSystem.value ? COLUMN_CATALOG_SATELLITE.value : COLUMN_CATALOG_SOLAR,
)

const columnsStorageKey = computed(() =>
  planetSystem.value
    ? `solestia.readoutColumns.${planetSystem.value.id}`
    : 'solestia.readoutColumns',
)

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
}

function onSettingsDocPointer(event: PointerEvent) {
  if (!settingsOpen.value) return
  const target = event.target
  if (target instanceof Node && settingsRoot.value?.contains(target)) return
  settingsOpen.value = false
}

function onSettingsDocKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !settingsOpen.value) return
  settingsOpen.value = false
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

function nextRotationKind(): RotationKind {
  const kinds = rotationKinds.value
  return kinds[(kinds.indexOf(rotationKind.value) + 1) % kinds.length]
}

function toggleRotationKind() {
  chosenRotationKind.value = nextRotationKind()
}

const rotationKindAria = computed(
  () =>
    `Rotation period as ${rotationKindWords.value[rotationKind.value]}. ` +
    `Click to show ${rotationKindWords.value[nextRotationKind()]}.`,
)

function toggleOrbitUnit() {
  orbitUnit.value = orbitUnit.value === 'earth' ? 'local' : 'earth'
}

function toggleDistanceUnit() {
  distanceUnit.value = distanceUnit.value === 'AU' ? 'km' : 'AU'
}

const distanceUnitAria = computed(() =>
  distanceUnit.value === 'AU'
    ? 'Current distance in AU. Click to show kilometers. Mean, perihelion, and aphelion follow.'
    : 'Current distance in kilometers. Click to show AU. Mean, perihelion, and aphelion follow.',
)

const distanceScale = computed(() => {
  const orbitOuter = isSatelliteSystem.value
    ? outerR
    : solarOrbitOuterR(innerR, outerR, bodies.value.length)
  return radialScale(bodies.value, innerR, orbitOuter)
})

const orbitalBands = computed(() => {
  const system = planetSystem.value
  if (system) {
    return resolveOrbitalBands(
      PLANET_SYSTEM_BANDS[system.id] ?? [],
      bodies.value,
      system.radiusKm,
      innerR,
      outerR,
      sunR,
    )
  }
  return resolveSolarOrbitalBands(SOLAR_SYSTEM_BANDS, distanceScale.value, outerR)
})

const rings = computed(() => {
  const earthPerihelionLongitude = props.snapshot.earthPerihelionLongitude
  const equatorOrigin = isPlanetSystemSnapshot(props.snapshot)
    ? props.snapshot.equatorOrigin
    : earthPerihelionLongitude
  const origin = useEquator.value ? equatorOrigin : earthPerihelionLongitude
  const frameLabel = isPlanetSystemSnapshot(props.snapshot) ? 'IAU' : props.snapshot.rotationFrame
  const planeWord = useEquator.value ? 'equatorial' : 'ecliptic'
  const scale = distanceScale.value
  return bodies.value.map((planet) => {
    const isMoon = 'equatorLongitude' in planet
    const bodyOffset =
      useEquator.value && isMoon ? planet.equatorLongitude : planet.offsetFromEarthPerihelion
    const displayBodyOffset = useEquator.value && isMoon ? wrapRad(bodyOffset - origin) : bodyOffset
    const periAbs =
      useEquator.value && isMoon ? planet.equatorPeriapsis : planet.perihelionLongitude
    const periOffset = wrapRad(
      useEquator.value && isMoon ? periAbs - origin : periAbs - earthPerihelionLongitude,
    )
    const body = orbitPoint(cx, cy, scale(planet.a * planet.orbitRadiusRatio), displayBodyOffset)
    const periapsisRadius = scale(planet.a * (1 - planet.e))
    const periTick = orbitPoint(cx, cy, periapsisRadius, periOffset)
    const periInner = orbitPoint(cx, cy, Math.max(0, periapsisRadius - 1.4), periOffset)
    const path = orbitPath(planet, periOffset, scale)

    const bodyR = planet.id === 'earth' ? 1.7 : 1.45
    const facing = useEquator.value && isMoon ? planet.equatorFacing : planet.facing
    const whisker = bodyWhisker(body, bodyR, facing, origin)
    const label =
      `${planet.name} — ${frameLabel} prime meridian faces ` +
      `${formatDeg(facing.longitude)} ${planeWord} longitude`

    return { planet, path, bodyR, body, periTick, periInner, whisker, label }
  })
})

type Point = { x: number; y: number }
type ViewWhisker = { from: Point; to: Point; variant: 'flat' | 'near' | 'far' }

/**
 * A prime-meridian whisker for one body. The flat views draw a bearing in the
 * reference plane, starting clear of the disc since nothing there can pass
 * behind it. Edge-on the whisker stands on the surface instead, so its own
 * disc hides it while the meridian faces away and it paints across the face
 * while the meridian faces the camera.
 *
 * `origin` is the azimuth of diagram-up, which edge-on is always Earth
 * perihelion — the axis the edge camera takes as depth, and the frame
 * `facing.direction` is expressed in.
 */
function whiskerFor(
  center: Point,
  bodyRadius: number,
  facing: Facing,
  origin: number,
  gap: number,
  min: number,
  max: number,
): ViewWhisker | null {
  if (useEdge.value) {
    const edge = edgeOnWhisker(center, bodyRadius, facing, origin, min, max)
    return edge && { from: edge.from, to: edge.to, variant: edge.far ? 'far' : 'near' }
  }
  const offset = wrapRad(facing.longitude - origin)
  const reach = bodyRadius + gap
  return {
    from: orbitPoint(center.x, center.y, reach, offset),
    to: orbitPoint(center.x, center.y, reach + min + (max - min) * facing.inPlane, offset),
    variant: 'flat',
  }
}

function centerWhisker(facing: Facing, origin: number): ViewWhisker | null {
  return whiskerFor(
    { x: cx, y: cy },
    sunR,
    facing,
    origin,
    sunFacingGap,
    sunFacingMin,
    sunFacingMax,
  )
}

function bodyWhisker(center: Point, bodyRadius: number, facing: Facing, origin: number) {
  return whiskerFor(center, bodyRadius, facing, origin, facingGap, facingMin, facingMax)
}

const sunMark = computed(() => {
  if (isPlanetSystemSnapshot(props.snapshot)) return null
  const { sun, earthPerihelionLongitude } = props.snapshot
  const whisker = centerWhisker(sun.facing, earthPerihelionLongitude)
  const label =
    `Sun — Carrington prime meridian faces ${formatDeg(sun.facing.longitude)} ecliptic ` +
    `longitude, one turn every ${sun.siderealRotationDays.toFixed(2)} d. ` +
    `Spin axis tilted ${formatDeg(sun.obliquity)} from ecliptic north`
  return { whisker, label }
})

const parentMark = computed(() => {
  if (!isPlanetSystemSnapshot(props.snapshot)) return null
  const { parent, earthPerihelionLongitude, equatorOrigin, parentEquatorFacing } = props.snapshot
  const facing = useEquator.value ? parentEquatorFacing : parent.facing
  const origin = useEquator.value ? equatorOrigin : earthPerihelionLongitude
  const whisker = centerWhisker(facing, origin)
  const planeWord = useEquator.value ? 'equatorial' : 'ecliptic'
  const label = `${parent.name} — IAU prime meridian faces ${formatDeg(facing.longitude)} ${planeWord} longitude`
  return { whisker, label, color: parent.color }
})

const sunTick = computed(() => {
  if (!isPlanetSystemSnapshot(props.snapshot)) return null
  const origin = useEquator.value
    ? props.snapshot.equatorOrigin
    : props.snapshot.earthPerihelionLongitude
  const offset = useEquator.value
    ? wrapRad(props.snapshot.sunEquator.longitude - origin)
    : props.snapshot.sunOffsetFromEarthPerihelion
  const inner = orbitPoint(cx, cy, innerR - 2, offset)
  const outer = orbitPoint(cx, cy, outerR + 2.2, offset)
  const label = orbitPoint(cx, cy, outerR + 2.2, offset)
  return { inner, outer, label, offset }
})

const upTick = computed(() => {
  if (!isSatelliteSystem.value) return null
  return {
    inner: orbitPoint(cx, cy, outerR + 0.4, 0),
    outer: orbitPoint(cx, cy, outerR + 1.6, 0),
  }
})

function relativeEcliptic(planet: OrreryBody): { x: number; y: number; z: number } {
  if (!isPlanetSystemSnapshot(props.snapshot)) return planet.position
  const { parent } = props.snapshot
  return {
    x: planet.position.x - parent.position.x,
    y: planet.position.y - parent.position.y,
    z: planet.position.z - parent.position.z,
  }
}

const projectedRings = computed(() => {
  const origin = props.snapshot.earthPerihelionLongitude
  const scale = distanceScale.value
  const at = props.snapshot.at
  const project = useEdge.value ? projectEdgeOn : projectEclipticTopDown
  return bodies.value.map((planet) => {
    const isMoon = 'equatorLongitude' in planet
    const position = relativeEcliptic(planet)
    const projected = project(cx, cy, position, origin, scale)
    const samples = isMoon
      ? satelliteRelativeOrbitPositions(planet.id, at)
      : keplerOrbitPositions(
          planet.a,
          planet.e,
          planet.inclination,
          planet.nodeLongitude,
          planet.perihelionLongitude,
        )
    const orbitPoints = samples.map((sample) => project(cx, cy, sample, origin, scale))
    const { far, near } = splitClosedByDepth(orbitPoints, useEdge.value ? 'positive' : 'negative')
    const periSample = samples[0]
    const peri = periSample ? project(cx, cy, periSample, origin, scale) : projected
    const periDx = peri.x - cx
    const periDy = peri.y - cy
    const periLen = Math.hypot(periDx, periDy)
    const periInner =
      periLen > 1e-6
        ? {
            x: peri.x - (periDx / periLen) * 1.4,
            y: peri.y - (periDy / periLen) * 1.4,
          }
        : peri
    const bodyR = planet.id === 'earth' ? 1.7 : 1.45
    const body = { x: projected.x, y: projected.y }
    const whisker = bodyWhisker(body, bodyR, planet.facing, origin)
    const latitude = formatDeg(Math.atan2(position.z, Math.hypot(position.x, position.y)))
    const label = useEdge.value
      ? `${planet.name} — ecliptic latitude ${latitude}`
      : `${planet.name} — ecliptic longitude ${formatDeg(planet.longitude)}, latitude ${latitude}`
    return {
      planet,
      bodyR,
      body,
      depth: projected.depth,
      far,
      near,
      stem: { x1: projected.x, y1: cy, x2: projected.x, y2: projected.y },
      periTick: peri,
      periInner,
      whisker,
      label,
    }
  })
})

const projectedBodies = computed(() =>
  [...projectedRings.value].sort((a, b) => (useEdge.value ? b.depth - a.depth : a.depth - b.depth)),
)

const edgeSunTick = computed(() => {
  if (!isPlanetSystemSnapshot(props.snapshot) || !useEdge.value) return null
  const sun = {
    x: -props.snapshot.parent.position.x,
    y: -props.snapshot.parent.position.y,
    z: -props.snapshot.parent.position.z,
  }
  const rho = Math.hypot(sun.x, sun.y, sun.z)
  if (rho < 1e-12) return null
  const unit = { x: sun.x / rho, y: sun.y / rho, z: sun.z / rho }
  const projected = projectEdgeOn(
    cx,
    cy,
    unit,
    props.snapshot.earthPerihelionLongitude,
    (distance) => distance,
  )
  const dx = projected.x - cx
  const dy = projected.y - cy
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  const reach = outerR + 2.2
  return {
    inner: { x: cx + (dx / len) * (sunR + 0.6), y: cy + (dy / len) * (sunR + 0.6) },
    outer: { x: cx + (dx / len) * reach, y: cy + (dy / len) * reach },
    label: { x: cx + (dx / len) * reach, y: cy + (dy / len) * reach },
  }
})

const viewBoxHeight = size + 2 * padY

/** Satellite systems are always drawn in the parent's IAU frame. */
const rotationFrame = computed(() =>
  isPlanetSystemSnapshot(props.snapshot) ? 'iau' : props.snapshot.rotationFrame,
)

/** HTML callout pinned to the selected disc; omitted when that body has no notes. */
const selectionCallout = computed(() => {
  if (!showNotes.value) return null
  const id = props.selectedPlanet
  if (!id) return null
  const paragraphs = SELECTION_NOTES[id as keyof typeof SELECTION_NOTES]
  if (!paragraphs?.length) return null
  const ring = (useProjectedCamera.value ? projectedRings.value : rings.value).find(
    (item) => item.planet.id === id,
  )
  if (!ring) return null
  const { x, y } = ring.body
  return {
    name: ring.planet.name,
    paragraphs,
    footer: primeMeridianLabel(id as keyof typeof SELECTION_NOTES, rotationFrame.value),
    left: `${x}%`,
    top: `${((y + padY) / viewBoxHeight) * 100}%`,
    flipLeft: x >= cx,
    flipAbove: y >= cy,
  }
})

function onBodyClick(id: string, event: MouseEvent) {
  if (event.detail > 1) return
  emit('select', id)
}

/** A planet with a system or time page, or a modeled belt band, can be opened. */
function requestOpen(id: string) {
  if (isSatelliteSystem.value) return
  if (
    id === 'asteroid-belt' ||
    id === 'kuiper-belt' ||
    planetSystemFor(id as PlanetState['id']) ||
    timePageFor(id)
  ) {
    emit('open', id)
  }
}

function onParentDblclick() {
  emit('select', 'sun')
}

const navigation = computed((): ReadoutNavigation[] =>
  isSatelliteSystem.value
    ? []
    : [
        {
          id: 'asteroid-belt',
          afterId: 'mars',
          name: 'Main asteroid belt',
          detail: '2.06–3.27 AU',
        },
        {
          id: 'kuiper-belt',
          afterId: 'neptune',
          name: 'Kuiper dwarf planets',
          detail: '30 AU and beyond',
        },
      ],
)

/** Moons read in km and parent radii; planets in AU or km, with the other unit dimmed. */
function distanceCell(planet: OrreryBody, factor: number): ReadoutCell {
  if (planetSystem.value && 'aKm' in planet) {
    const km = planet.aKm * factor
    return {
      primary: formatQuantity(km, 'km'),
      secondary: formatQuantity(km / planetSystem.value.radiusKm, planetSystem.value.radiusSymbol),
    }
  }
  return formatHeliocentricDistance(planet.a * factor, distanceUnit.value)
}

const rows = computed((): ReadoutRow[] =>
  bodies.value.map((planet) => {
    const kind = rotationKind.value
    const parentDay = 'parentDayDays' in planet ? planet.parentDayDays : Number.POSITIVE_INFINITY
    const isSynchronous = 'parentDayDays' in planet && !Number.isFinite(parentDay)
    const locked = kind === 'parent' && isSynchronous
    const rotationDays =
      kind === 'sidereal'
        ? planet.siderealRotationDays
        : kind === 'solar'
          ? planet.solarDayDays
          : parentDay
    const localOrbitDays = planet.siderealOrbitDays / rotationDays
    const localUnit = kind === 'sidereal' ? 'sid. d' : kind === 'solar' ? 'sol. d' : 'parent d'
    const spinOrbit = planet.siderealOrbitDays / planet.siderealRotationDays
    const wobble = eccentricityWobble(planet.e)
    const wobbleTime = formatDuration((wobble / (Math.PI * 2)) * planet.solarDayDays)
    const spin = locked
      ? `${planetSystem.value?.name ?? 'The parent'} never rises or sets here: ${planet.name} spins once per orbit, so it ` +
        `hangs over the sub-parent point, swinging ±${formatFineDeg(wobble)} once per ` +
        `${formatQuantity(planet.siderealOrbitDays, 'd')} orbit. The far side never sees it.`
      : `Spin axis tilted ${formatDeg(planet.obliquity)} from ecliptic north${
          planet.retrograde ? ' — rotates retrograde' : ''
        }`
    return {
      id: planet.id,
      name: planet.name,
      color: planet.color,
      cells: {
        e: { primary: formatEcc(planet.e) },
        obliquity: {
          primary: formatDeg(planet.obliquity),
          secondary: formatRad(planet.obliquity),
          title: spin,
        },
        rotation: locked
          ? { primary: '∞', secondary: '1:1 lock', title: spin }
          : {
              primary: formatQuantity(rotationDays * HOURS_PER_DAY, 'h'),
              secondary: formatQuantity(rotationDays, 'd'),
              title: spin,
            },
        orbit:
          orbitUnit.value === 'earth'
            ? {
                primary: formatQuantity(planet.siderealOrbitDays, 'd'),
                secondary: isSatelliteSystem.value
                  ? undefined
                  : formatQuantity(planet.siderealOrbitDays / JULIAN_YEAR_DAYS, 'yr'),
              }
            : locked
              ? {
                  primary: '—',
                  title: `With ${planetSystem.value?.name ?? 'the parent'} fixed in the sky there are no parent days to count. One orbit is exactly one rotation.`,
                }
              : { primary: formatQuantity(localOrbitDays, localUnit) },
        longitude: {
          primary: formatDeg(planet.longitude),
          secondary: formatRad(planet.longitude),
        },
        anomaly: {
          primary: formatDeg(planet.trueAnomaly),
          secondary: formatRad(planet.trueAnomaly),
        },
        inclination: {
          primary: formatDeg(planet.inclination),
          secondary: formatRad(planet.inclination),
        },
        day: {
          primary: `${(planet.dayFraction * 100).toFixed(1)}%`,
          secondary: formatDayClock(planet.dayFraction),
        },
        libration: isSatelliteSystem.value
          ? {
              primary: `±${formatFineDeg(wobble)}`,
              secondary: formatQuantity(planet.siderealOrbitDays, 'd'),
              title: isSynchronous
                ? `${planetSystem.value?.name ?? 'The parent'} swings ±${formatFineDeg(wobble)} east and west of the sub-parent point, ` +
                  `once per orbit. The spin is uniform but an eccentric orbit is not, which is ` +
                  `optical libration — the same effect that shows Earth a little around each limb of the Moon.`
                : `The true anomaly runs up to ${formatFineDeg(wobble)} ahead of and behind uniform mean anomaly over one orbit. ` +
                  `Because ${planet.name} is not locked, this is not libration around a fixed sub-parent point.`,
            }
          : {
              primary: `±${formatFineDeg(wobble)}`,
              secondary: `±${wobbleTime}`,
              title:
                `Apparent solar time runs up to ${wobbleTime} ahead of and behind a uniform clock, ` +
                `because an eccentric orbit carries the Sun across the sky unevenly. This is the ` +
                `eccentricity term of the equation of time; the obliquity term is left out.`,
            },
        w0: { primary: formatDeg(planet.w0), secondary: formatRad(planet.w0) },
        resonance: {
          primary: spinOrbit.toFixed(3),
          secondary: simpleRatio(spinOrbit) ?? undefined,
        },
        a: distanceCell(planet, 1),
        q: distanceCell(planet, 1 - planet.e),
        Q: distanceCell(planet, 1 + planet.e),
        r: distanceCell(planet, planet.orbitRadiusRatio),
      },
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
        <Transition name="menu">
          <div
            v-show="settingsOpen"
            id="orrery-settings"
            class="orrery__settings-menu"
            aria-labelledby="orrery-settings-title"
          >
            <p id="orrery-settings-title" class="orrery__settings-title">Display</p>
            <label class="orrery__settings-item">
              <input v-model="showFacing" type="checkbox" />
              {{ isSatelliteSystem ? 'Moon facing' : 'Planet facing' }}
            </label>
            <label class="orrery__settings-item">
              <input v-model="showSunFacing" type="checkbox" />
              {{ isSatelliteSystem ? `${planetSystem?.name} facing` : 'Sun facing' }}
            </label>
            <label class="orrery__settings-item">
              <input v-model="showPerihelion" type="checkbox" />
              {{ isSatelliteSystem ? planetSystem?.periapsisName : 'Perihelion' }}
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
          isSatelliteSystem
            ? useEdge
              ? `${planetSystem?.name} system orrery edge-on to the ecliptic, compressed distance scale`
              : useEquator
                ? `${planetSystem?.name} system orrery in the parent equator, Earth perihelion projected at the top`
                : `${planetSystem?.name} system orrery viewed from ecliptic north, compressed distance scale`
            : useEdge
              ? 'Solar system orrery edge-on to the ecliptic, compressed distance scale'
              : 'Solar system orrery viewed from ecliptic north, compressed distance scale'
        "
      >
        <title>
          {{
            isSatelliteSystem
              ? live
                ? `${planetSystem?.name} system now`
                : `${planetSystem?.name} system at ${snapshot.at.toISOString()}`
              : live
                ? 'Solar system now'
                : `Solar system at ${snapshot.at.toISOString()}`
          }}
        </title>
        <desc>
          {{
            isSatelliteSystem
              ? useEdge
                ? `Orbits of ${planetSystem?.orbitGroupName} about the focus at ${planetSystem?.name}, viewed edge-on to the ecliptic. Vertical is ecliptic north. A body out to the side shows its full ecliptic latitude; one coming toward or going away from the viewer is foreshortened. Mean distances are spread evenly and the radial scale is compressed between them. Bodies nearer along Earth’s perihelion direction are drawn in front. Each whisker stands on the surface point its prime meridian passes through: it slides in from the limb and shortens as that meridian turns to face the camera, paints across the disc while facing the viewer, and its own disc hides it while facing away.`
                : useEquator
                  ? `Orbits of ${planetSystem?.orbitGroupName} about the focus at ${planetSystem?.name}, viewed in ${planetSystem?.name}’s equator. Mean distances are spread evenly and the radial scale is compressed between them, so radial swings read smaller than they are. Earth’s perihelion is projected at the top. The Sun’s azimuth is seasonal. Each moon’s whisker shows where its prime meridian points.`
                  : `Orbits of ${planetSystem?.orbitGroupName} about the focus at ${planetSystem?.name}, seen by an orthographic camera north of the ecliptic. Inclined orbits are foreshortened in the ecliptic plane; the Uranian moons therefore appear as thin slivers and pass close to the focus. Mean distances are spread evenly and the radial scale is compressed between them. Earth’s perihelion is up. Bodies above the ecliptic are drawn in front. The table’s r remains the full three-dimensional distance.`
              : useEdge
                ? 'Orbits of Mercury through Neptune about the focus at the Sun, viewed edge-on to the ecliptic. Vertical is ecliptic north. A planet out to the side shows its full ecliptic latitude; one coming toward or going away from the viewer is foreshortened. Mean distances are spread evenly and the radial scale is compressed between them. Bodies nearer along Earth’s perihelion direction are drawn in front. Each whisker stands on the surface point its prime meridian passes through: it slides in from the limb and shortens as that meridian turns to face the camera, paints across the disc while facing the viewer, and its own disc hides it while facing away. The Sun’s axis is tilted only 7 degrees from ecliptic north, so its whisker stays close to the horizontal.'
                : 'Orbits of Mercury through Neptune about the focus at the Sun, seen by an orthographic camera north of the ecliptic. Inclined orbits are foreshortened in the ecliptic plane. Mean distances are spread evenly and the radial scale is compressed between them. Earth’s perihelion is at the top, aphelion at the bottom. Bodies above the ecliptic are drawn in front. Each planet carries a short whisker showing where its prime meridian points.'
          }}
          <template v-if="orbitalBands.length && (!isSatelliteSystem || useEquator)">
            The shaded annulus marks {{ orbitalBands.map((band) => band.name).join(', ') }} at its
            physical radial extent.
          </template>
        </desc>
        <line
          v-if="useEdge"
          class="axis"
          :x1="cx - outerR - 1"
          :y1="cy"
          :x2="cx + outerR + 1"
          :y2="cy"
        />
        <line v-else class="axis" :x1="cx" :y1="cy - outerR - 1" :x2="cx" :y2="cy + outerR + 1" />
        <g
          v-if="orbitalBands.length && (!isSatelliteSystem || useEquator) && !useEdge"
          class="orbital-bands"
          aria-hidden="true"
        >
          <circle
            v-for="band in orbitalBands"
            :key="band.id"
            :class="{
              'orbital-band': true,
              'orbital-band--open': band.id === 'asteroid-belt' || band.id === 'kuiper-belt',
            }"
            :cx="cx"
            :cy="cy"
            :r="band.radius"
            :stroke-width="band.width"
            @dblclick="requestOpen(band.id)"
          >
            <title v-if="band.id === 'asteroid-belt'">Open the large asteroid belt objects</title>
            <title v-else-if="band.id === 'kuiper-belt'">Open the Kuiper dwarf planets</title>
          </circle>
        </g>
        <template v-if="!isSatelliteSystem && !useEdge">
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
        <template v-else-if="isSatelliteSystem && !useEdge">
          <line
            v-if="upTick"
            class="peri-tick"
            :x1="upTick.inner.x"
            :y1="upTick.inner.y"
            :x2="upTick.outer.x"
            :y2="upTick.outer.y"
          >
            <title>
              {{
                useEquator
                  ? 'Earth perihelion projected into the parent equator (diagram up)'
                  : 'Earth perihelion direction (diagram up)'
              }}
            </title>
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
              <title>
                {{
                  useEquator
                    ? `Sun from ${planetSystem?.name}, azimuth in the parent equator`
                    : `Direction of the Sun from ${planetSystem?.name}`
                }}
              </title>
            </text>
          </g>
        </template>
        <template v-else-if="isSatelliteSystem && edgeSunTick">
          <line
            class="sun-ray"
            :x1="edgeSunTick.inner.x"
            :y1="edgeSunTick.inner.y"
            :x2="edgeSunTick.outer.x"
            :y2="edgeSunTick.outer.y"
          />
          <text
            class="axis-label"
            :x="edgeSunTick.label.x"
            :y="edgeSunTick.label.y"
            text-anchor="middle"
          >
            ☉
            <title>
              Direction of the Sun from {{ planetSystem?.name }}, edge-on to the ecliptic
            </title>
          </text>
        </template>
        <template v-if="useProjectedCamera">
          <g
            v-for="ring in projectedRings"
            :key="`far-${ring.planet.id}`"
            class="orbit-far"
            aria-hidden="true"
          >
            <path v-for="(d, index) in ring.far" :key="index" class="orbit" :d="d" />
          </g>
        </template>
        <template v-else>
          <g
            v-for="ring in rings"
            :key="ring.planet.id"
            :class="{ 'satellite-group': true, selected: selectedPlanet === ring.planet.id }"
            @click="onBodyClick(ring.planet.id, $event)"
            @dblclick="requestOpen(ring.planet.id)"
          >
            <title>{{ ring.label }}</title>
            <path class="orbit" :d="ring.path" />
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
              :style="{ '--body-color': ring.planet.color }"
            />
            <line
              v-if="showFacing && ring.whisker"
              class="facing"
              :x1="ring.whisker.from.x"
              :y1="ring.whisker.from.y"
              :x2="ring.whisker.to.x"
              :y2="ring.whisker.to.y"
              :style="{ '--facing-stroke': ring.planet.color }"
            />
          </g>
        </template>
        <g v-if="sunMark" class="sun-mark">
          <title>{{ sunMark.label }}</title>
          <line
            v-if="showSunFacing && sunMark.whisker?.variant === 'far'"
            class="sun-facing facing--far"
            :x1="sunMark.whisker.from.x"
            :y1="sunMark.whisker.from.y"
            :x2="sunMark.whisker.to.x"
            :y2="sunMark.whisker.to.y"
          />
          <circle class="sun" :cx="cx" :cy="cy" :r="sunR" />
          <line
            v-if="showSunFacing && sunMark.whisker && sunMark.whisker.variant !== 'far'"
            class="sun-facing"
            :class="{ 'facing--near': sunMark.whisker.variant === 'near' }"
            :x1="sunMark.whisker.from.x"
            :y1="sunMark.whisker.from.y"
            :x2="sunMark.whisker.to.x"
            :y2="sunMark.whisker.to.y"
          />
        </g>
        <g v-else-if="parentMark" class="sun-mark" @dblclick="onParentDblclick">
          <title>{{ parentMark.label }}</title>
          <line
            v-if="showSunFacing && parentMark.whisker?.variant === 'far'"
            class="planet-center-facing facing--far"
            :x1="parentMark.whisker.from.x"
            :y1="parentMark.whisker.from.y"
            :x2="parentMark.whisker.to.x"
            :y2="parentMark.whisker.to.y"
            :style="{ '--facing-stroke': parentMark.color }"
          />
          <circle class="planet-center" :cx="cx" :cy="cy" :r="sunR" :fill="parentMark.color" />
          <line
            v-if="showSunFacing && parentMark.whisker && parentMark.whisker.variant !== 'far'"
            class="planet-center-facing"
            :class="{ 'facing--near': parentMark.whisker.variant === 'near' }"
            :x1="parentMark.whisker.from.x"
            :y1="parentMark.whisker.from.y"
            :x2="parentMark.whisker.to.x"
            :y2="parentMark.whisker.to.y"
            :style="{ '--facing-stroke': parentMark.color }"
          />
        </g>
        <template v-if="useProjectedCamera">
          <g
            v-for="ring in projectedRings"
            :key="`near-${ring.planet.id}`"
            class="orbit-near"
            aria-hidden="true"
          >
            <path v-for="(d, index) in ring.near" :key="index" class="orbit" :d="d" />
          </g>
          <g
            v-for="ring in projectedBodies"
            :key="ring.planet.id"
            :class="{ 'satellite-group': true, selected: selectedPlanet === ring.planet.id }"
            @click="onBodyClick(ring.planet.id, $event)"
            @dblclick="requestOpen(ring.planet.id)"
          >
            <title>{{ ring.label }}</title>
            <!-- <line
              v-if="useEdge"
              class="edge-stem"
              :x1="ring.stem.x1"
              :y1="ring.stem.y1"
              :x2="ring.stem.x2"
              :y2="ring.stem.y2"
            /> -->
            <line
              v-if="showPerihelion"
              class="peri-tick"
              :x1="ring.periInner.x"
              :y1="ring.periInner.y"
              :x2="ring.periTick.x"
              :y2="ring.periTick.y"
            />
            <line
              v-if="showFacing && ring.whisker?.variant === 'far'"
              class="facing facing--far"
              :x1="ring.whisker.from.x"
              :y1="ring.whisker.from.y"
              :x2="ring.whisker.to.x"
              :y2="ring.whisker.to.y"
              :style="{ '--facing-stroke': ring.planet.color }"
            />
            <circle
              class="body"
              :cx="ring.body.x"
              :cy="ring.body.y"
              :r="ring.bodyR"
              :fill="ring.planet.color"
              :style="{ '--body-color': ring.planet.color }"
            />
            <line
              v-if="showFacing && ring.whisker && ring.whisker.variant !== 'far'"
              class="facing"
              :class="{ 'facing--near': ring.whisker.variant === 'near' }"
              :x1="ring.whisker.from.x"
              :y1="ring.whisker.from.y"
              :x2="ring.whisker.to.x"
              :y2="ring.whisker.to.y"
              :style="{ '--facing-stroke': ring.planet.color }"
            />
          </g>
        </template>
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
        <div class="orrery__note-content">
          <p class="orrery__note-title">{{ selectionCallout.name }}</p>
          <p v-for="(paragraph, i) in selectionCallout.paragraphs" :key="i">{{ paragraph }}</p>
        </div>
        <div class="orrery__note-footer">{{ selectionCallout.footer }}</div>
      </aside>
    </div>

    <BodyReadout
      title="Orbit data"
      :body-heading="isSatelliteSystem ? 'Moon' : 'Planet'"
      :columns="columns"
      :rows="rows"
      :storage-key="columnsStorageKey"
      :selected-id="selectedPlanet"
      :navigation="navigation"
      @select="emit('select', $event)"
      @open="requestOpen"
    >
      <template #help>
        <template v-if="!isSatelliteSystem">
          <p>
            <strong>e</strong> is orbital eccentricity — 0 is a circle, Mercury’s ~0.206 is the most
            stretched among the planets. Each orbit above is drawn with the Sun at its focus, so
            Mercury’s and Mars’s sit visibly off center.
          </p>
          <p>
            Screen radius rises with real distance, but not proportionally: the mean distances are
            spread evenly and the scale is compressed between them, so Mercury and Neptune share one
            frame. Distances stay comparable, but every radial swing draws smaller than it is. The
            ecliptic view is an orthographic camera looking from ecliptic north, so inclination
            foreshortens the orbit on screen. Edge rotates that camera 90°: vertical is ecliptic
            north, and bodies nearer along Earth’s perihelion direction paint in front.
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
            <strong>r</strong> is the current heliocentric distance. Click the heading to lead with
            AU or km; <strong>a</strong>, <strong>q</strong>, and <strong>Q</strong> follow. Those
            three are mean, perihelion, and aphelion.
          </p>
          <p>
            <strong>P<sub>rot</sub></strong> is the rotation period in the longitude system chosen
            at the top of the page (IAU cartographic W, magnetic System III, or cloud features).
            Inner planets have only the IAU frame, so magnetic and cloud leave them unchanged. Click
            the heading to switch between a sidereal day (one spin relative to the stars) and a
            solar day (noon to noon). Hover a value for that planet’s axial tilt. The whisker on
            each planet above points where that meridian faces; it shortens as the meridian tips out
            of the ecliptic plane and away from the viewer. The Sun carries one too, on the
            Carrington rate of 25.38 days — a convention rather than a rigid period, since the
            photosphere spins faster at the equator than near the poles.
          </p>
          <p>
            <strong>P<sub>orb</sub></strong> is the sidereal orbital period — one revolution around
            the Sun relative to the stars. Click the heading to express it in Earth days and years,
            or in that planet’s own days (sidereal or solar, matching P<sub>rot</sub>).
          </p>
          <p>
            <strong>eot</strong> is the equation of time: how far apparent solar time runs ahead of
            and behind a uniform clock, because an eccentric orbit carries the Sun across the sky
            unevenly. The swing is ±2e radians of rotation, ±7.66 min for Earth but ±11.5 days for
            Mercury — which is why Mercury’s hand above creeps backwards near perihelion. The
            obliquity term, which splits the year in two, is left out.
          </p>
          <p>
            <strong>Orbit accuracy.</strong> The elements are a linear fit valid 1800–2050, which is
            where the epoch clamps, not an integrated ephemeris. JPL quotes about 20″ of
            heliocentric longitude for the inner planets, rising to 600″ for Saturn — roughly 8
            minutes of orbital phase for Earth and about 5 days for Saturn — with distances off by
            6,000 km for Earth and 0.01 AU for Saturn. Earth’s row is really the Earth–Moon
            barycenter, so its perihelion instant can miss by a day.
          </p>
          <p>
            <strong>Spin accuracy.</strong> W is exact by construction, since the IAU tabulates a
            defined rate rather than a measurement. The error is in what is left out: periodic
            nutation and libration, largest at Neptune’s ±0.7° pole wobble and then Mercury’s
            ~0.03°, and rates that are conventions rather than periods — the Sun’s Carrington rate,
            Jupiter’s and Saturn’s System I. Civil UTC also goes straight into a formula that wants
            barycentric dynamical time, which leaves every meridian about 70 seconds short, 0.3° for
            Earth.
          </p>
        </template>
        <template v-else>
          <p>
            <strong>e</strong> is orbital eccentricity in {{ planetSystem?.orbitPlaneName }}. The
            orbit paths put {{ planetSystem?.name }} at the focus, so an eccentric orbit sits off
            center and the moon closes in and pulls away as it goes round.
          </p>
          <p>
            Screen radius rises with real distance, but not proportionally: the mean distances are
            spread evenly and the scale is compressed between them, which is what keeps orbits tens
            of times apart inside one frame. Distances stay comparable, so no moon is drawn inside
            another it never reaches, but every radial swing draws smaller than it is. Read
            <strong>q</strong> and <strong>Q</strong> below for the true extremes.
          </p>
          <p>
            <strong>λ</strong> is planetocentric longitude around {{ planetSystem?.name }}. The
            ecliptic view looks down from ecliptic north, with Earth perihelion up; inclined orbits
            are foreshortened and can pass close to the focus. {{ planetSystem?.name }}’s equator is
            the face-on view where moons run evenly and the Sun’s azimuth is seasonal. Edge rotates
            the ecliptic camera 90°, with ecliptic north vertical. The table’s λ stays ecliptic, and
            r remains the full three-dimensional distance, so r need not match screen radius.
            <strong>ν</strong> is the true anomaly from {{ planetSystem?.periapsisName }}.
          </p>
          <p>
            <strong>i</strong> is inclination to {{ planetSystem?.orbitPlaneName }}.
            <strong>r</strong> is the current distance from {{ planetSystem?.name }}.
            <strong>a</strong>, <strong>q</strong>, and <strong>Q</strong> are mean,
            {{ planetSystem?.periapsisName }}, and {{ planetSystem?.apoapsisName }} distances in km
            and {{ planetSystem?.name }} radii.
          </p>
          <p>
            <strong>P<sub>rot</sub></strong> is the IAU sidereal spin. Click the heading for the
            solar day — noon to noon for the Sun, not {{ planetSystem?.name }} — and again for the
            parent day, the time for {{ planetSystem?.name }} to stand on the same meridian again.
            It reads ∞ for a synchronous moon: <strong>P<sub>orb</sub>/P<sub>rot</sub></strong> is 1
            and the parent never leaves its spot in the sky. A finite parent day means the moon is
            not locked, so the parent moves around its sky.
          </p>
          <p>
            <strong>lib</strong> is the orbital equation of center, about ±2e radians for a
            low-eccentricity orbit. It appears as optical libration around the sub-parent point only
            on a synchronously rotating moon.
          </p>
          <p>
            <strong>Orbit accuracy.</strong> These are JPL mean elements at J2000 plus apsidal and
            nodal precession, not an integrated ephemeris.
            <template v-if="planetSystem?.id === 'earth'">
              Orientation is the compact IAU 2009 series rather than a modern lunar ephemeris, so
              the smallest libration terms are missing.
            </template>
            <template v-else>
              Each moon is an independent ellipse, so nothing holds a resonance between
              them<template v-if="planetSystem?.id === 'jupiter'">
                — the Laplace 4:2:1 chain drifts apart</template
              >.
            </template>
            By the far ends of the 1800–2050 window the sub-{{ planetSystem?.name }} point has
            wandered a few degrees.
          </p>
        </template>
      </template>
      <template v-if="!isSatelliteSystem" #head-r>
        <button
          type="button"
          class="th-toggle"
          :aria-label="distanceUnitAria"
          @click="toggleDistanceUnit"
        >
          <span class="th-sym">r</span>
          <span class="th-mode">{{ distanceUnit }}</span>
        </button>
      </template>
      <template #head-rotation>
        <button
          type="button"
          class="th-toggle"
          :aria-label="rotationKindAria"
          @click="toggleRotationKind"
        >
          <span class="th-sym">P<sub>rot</sub></span>
          <span class="th-mode">{{ rotationKind }}</span>
        </button>
      </template>
      <template #head-orbit>
        <button
          type="button"
          class="th-toggle"
          :aria-label="
            orbitUnit === 'earth'
              ? isSatelliteSystem
                ? 'Orbital period in Earth days. Click to show the moon’s own days.'
                : 'Orbital period in Earth days and years. Click to show the planet’s own days.'
              : isSatelliteSystem
                ? 'Orbital period in the moon’s own days. Click to show Earth days.'
                : 'Orbital period in the planet’s own days. Click to show Earth days and years.'
          "
          @click="toggleOrbitUnit"
        >
          <span class="th-sym">P<sub>orb</sub></span>
          <span class="th-mode">{{ orbitUnit === 'earth' ? 'Earth d' : 'own days' }}</span>
        </button>
      </template>
      <template #head-resonance>
        <span class="th-sym">P<sub>orb</sub>/P<sub>rot</sub></span>
      </template>
    </BodyReadout>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/menu' as menu;
@use '../styles/variables' as *;

@include menu.menu-transition;

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
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(18.5rem, 70%);
  max-height: min(12rem, 45%);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  background: var(--bg-raised);
  box-shadow: 0 0.5rem 1.25rem rgb(0 0 0 / 35%);
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

.orrery__note-content {
  overflow: auto;
  padding: 0.65rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  color: var(--text);
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

.orrery__note-footer {
  margin-top: 0.4rem;
  padding: 2px 0.75rem;
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--bg) 75%, var(--bg-raised));
  color: $color-text-muted;
}

.orrery__settings {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
}

.orrery__settings-btn {
  @include menu.icon-button;
}

.orrery__settings-btn svg {
  width: 0.95rem;
  height: 0.95rem;
  transition: transform 250ms ease;
}

.orrery__settings-btn:hover svg,
.orrery__settings-btn[aria-expanded='true'] svg {
  transform: rotate(45deg);
}

.orrery__settings-menu {
  @include menu.menu-panel;
}

.orrery__settings-title {
  @include menu.menu-title;
}

.orrery__settings-item {
  @include menu.menu-item;
}

@media (prefers-reduced-motion: reduce) {
  .orrery__settings-btn svg {
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

.orbit-far .orbit {
  opacity: 0.65;
}

// .edge-stem {
//   stroke: color-mix(in srgb, var(--text-dim) 40%, transparent);
//   stroke-width: 0.2;
//   pointer-events: none;
// }

.orbit {
  fill: none;
  stroke: var(--border);
  stroke-width: 0.35;
}

.orbital-bands {
  pointer-events: none;
}

.orbital-band {
  fill: none;
  stroke: color-mix(in srgb, var(--accent) 24%, transparent);
}

.orbital-band--open {
  pointer-events: stroke;
  cursor: pointer;

  &:hover {
    stroke: color-mix(in srgb, var(--accent) 42%, transparent);
  }
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

.body {
  stroke: color-mix(in srgb, var(--body-color) 45%, white);
  stroke-width: 0.15;
}

.peri-tick {
  stroke: color-mix(in srgb, var(--accent) 55%, transparent);
  stroke-width: 0.35;
}

.facing {
  stroke: var(--facing-stroke);
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.55;

  /* Zero-specificity so the depth modifiers below can still win on stroke. */
  :where(g.selected) & {
    opacity: 0.95;
  }
}

.sun {
  fill: var(--accent);
}

.planet-center-facing,
.sun-facing {
  --facing-stroke: var(--accent);

  stroke: var(--facing-stroke);
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.7;
}

/**
 * Edge-on, a whisker stands on the body's surface. Facing the camera it paints
 * across the disc, so it is darkened to read against the body color underneath.
 * Facing away it is buried, and only what clears the limb shows — dimmed with
 * `stroke-opacity` so it multiplies with the selected state rather than
 * fighting it.
 */
.facing--near {
  stroke: color-mix(in srgb, var(--facing-stroke) 45%, black);
}

.facing--far {
  stroke-opacity: 0.45;
}

.sun-mark {
  cursor: pointer;
}

.sun-ray {
  stroke: color-mix(in srgb, var(--accent) 55%, transparent);
  stroke-width: 0.25;
  stroke-dasharray: 0.6 0.7;
}
</style>
