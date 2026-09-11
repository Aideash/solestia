<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import FieldReadout, { type FieldPin, type FieldCursor } from '../components/FieldReadout.vue'
import FieldsView, { type FieldsMode, type SceneFeature } from '../components/FieldsView.vue'
import WindStrip from '../components/WindStrip.vue'
import { PLANETS } from '../data/planets.ts'
import { epochKey } from '../epoch.ts'
import {
  gravityCameraFromBasis,
  shellCameraFromLook,
  vecNormalize,
  vecScale,
  vecSub,
  type ShellCamera,
} from '../lib/camera.ts'
import {
  cr3bpFromEarthMoon,
  effectivePotentialGradient,
  lagrangePoints,
  orbitNormalFromPositions,
  perturbedTriangularPoints,
} from '../lib/cr3bp.ts'
import { R_EARTH_KM, R_MOON_KM } from '../lib/eclipses.ts'
import {
  EARTH_MOON_MASS_RATIO,
  KM_PER_AU,
  centuriesSinceJ2000,
  planetSystemAt,
  wrapRad,
  wrapRadSigned,
  type Vec3,
} from '../lib/kepler.ts'
import {
  cavityFromWind,
  earthDipole,
  insideMagnetopause,
  magnetosphereField,
} from '../lib/magnetosphere.ts'
import { pdynAt } from '../lib/solarWind.ts'
import { gravitationalPotential, redshiftNsPerDay } from '../lib/redshift.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const earthBody = PLANETS.find((planet) => planet.id === 'earth')
if (!earthBody) throw new Error('Earth missing')

const viewed = epoch.viewed
const live = epoch.live
const snapshot = computed(() => planetSystemAt(viewed.value, 'earth'))
const mode = ref<FieldsMode>('gravity')
const helpOpen = ref(false)
const pins = ref<FieldPin[]>([])
const cursor = ref<FieldCursor | null>(null)
const readoutRef = ref<{ notifyPinned: () => Promise<void> } | null>(null)

const MAX_PINS = 5

function moonFromEarthKm(at: Date): Vec3 {
  const snap = planetSystemAt(at, 'earth')
  const moon = snap.satellites[0]
  return vecScale(vecSub(moon.position, snap.parent.position), KM_PER_AU)
}

const sunFromEarth = computed(() => vecScale(snapshot.value.parent.position, -1))

const cr3bp = computed(() => {
  const moonKm = moonFromEarthKm(viewed.value)
  const laterKm = moonFromEarthKm(new Date(viewed.value.getTime() + 10 * 60 * 1000))
  return cr3bpFromEarthMoon({
    moonFromEarthKm: moonKm,
    orbitNormal: orbitNormalFromPositions(moonKm, laterKm),
    massRatio: EARTH_MOON_MASS_RATIO,
    sunFromEarthKm: vecScale(sunFromEarth.value, KM_PER_AU),
  })
})

const dipole = computed(() => earthDipole(earthBody.iau, centuriesSinceJ2000(viewed.value) * 36525))
const windSample = computed(() => pdynAt(viewed.value))
const solarWind = computed(() => ({ pdynNPa: windSample.value.pdynNPa }))
const cavity = computed(() => cavityFromWind(solarWind.value.pdynNPa))

function gravityRadiusAu(sepKm: number): number {
  return (sepKm / KM_PER_AU) * 1.55
}

function magneticRadiusAu(): number {
  return (32 * R_EARTH_KM) / KM_PER_AU
}

function gravityCamera(): ShellCamera {
  return gravityCameraFromBasis(cr3bp.value.basis)
}

function magneticCamera(sun: Vec3): ShellCamera {
  return shellCameraFromLook({ x: -sun.y, y: sun.x, z: 0.08 })
}

const camera = ref<ShellCamera>(gravityCamera())
const viewRadiusAu = ref(gravityRadiusAu(384_400))
let anim = 0
let animating = false

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function animateTo(next: { camera: ShellCamera; viewRadiusAu: number }) {
  const reduced = prefersReducedMotion()
  if (reduced) {
    camera.value = next.camera
    viewRadiusAu.value = next.viewRadiusAu
    return
  }
  const fromCam = camera.value
  const fromR = viewRadiusAu.value
  const start = performance.now()
  const duration = 480
  cancelAnimationFrame(anim)
  animating = true
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    const e = 1 - (1 - t) ** 3
    camera.value = {
      longitude: lerpAngle(fromCam.longitude, next.camera.longitude, e),
      latitude: lerp(fromCam.latitude, next.camera.latitude, e),
    }
    viewRadiusAu.value = lerp(fromR, next.viewRadiusAu, e)
    if (t < 1) anim = requestAnimationFrame(step)
    else animating = false
  }
  anim = requestAnimationFrame(step)
}

const sunLongitude = computed(() => Math.atan2(sunFromEarth.value.y, sunFromEarth.value.x))
const moonLongitude = computed(() =>
  Math.atan2(cr3bp.value.moonFromEarthKm.y, cr3bp.value.moonFromEarthKm.x),
)

function trackCameraLongitude(longitude: number, previous: number | undefined) {
  if (previous === undefined || animating) return
  camera.value = {
    ...camera.value,
    longitude: wrapRad(camera.value.longitude + wrapRadSigned(longitude - previous)),
  }
}

/** Magnetism holds a solar frame: swing the camera with the Sun so the dayside stays put. */
watch(sunLongitude, (longitude, previous) => {
  if (mode.value !== 'magnetism') return
  trackCameraLongitude(longitude, previous)
})

/** Gravity holds a lunar frame: swing the camera with the Moon so L1–L5 stay put. */
watch(moonLongitude, (longitude, previous) => {
  if (mode.value !== 'gravity') return
  trackCameraLongitude(longitude, previous)
})

function resetCamera() {
  if (mode.value === 'gravity') {
    camera.value = gravityCamera()
    viewRadiusAu.value = gravityRadiusAu(cr3bp.value.separationKm)
  } else {
    camera.value = magneticCamera(sunFromEarth.value)
    viewRadiusAu.value = magneticRadiusAu()
  }
}

function setMode(next: FieldsMode) {
  if (next === mode.value) return
  mode.value = next
  cursor.value = null
  if (next === 'gravity') {
    animateTo({
      camera: gravityCamera(),
      viewRadiusAu: gravityRadiusAu(cr3bp.value.separationKm),
    })
  } else {
    animateTo({
      camera: magneticCamera(sunFromEarth.value),
      viewRadiusAu: magneticRadiusAu(),
    })
  }
}

const features = computed((): SceneFeature[] => {
  if (mode.value === 'gravity') {
    const p = lagrangePoints(cr3bp.value)
    const primed = perturbedTriangularPoints(cr3bp.value)
    const classical: SceneFeature[] = [
      { id: 'earth', label: 'Earth', positionKm: { x: 0, y: 0, z: 0 } },
      { id: 'moon', label: 'Moon', positionKm: cr3bp.value.moonFromEarthKm },
      { id: 'l1', label: 'L1', positionKm: p.l1 },
      { id: 'l2', label: 'L2', positionKm: p.l2 },
      { id: 'l3', label: 'L3', positionKm: p.l3 },
      { id: 'l4', label: 'L4', positionKm: p.l4 },
      { id: 'l5', label: 'L5', positionKm: p.l5 },
    ]
    const perturbed: SceneFeature[] = []
    if (primed.l4) {
      perturbed.push({
        id: 'l4-prime',
        label: 'L4′',
        positionKm: primed.l4,
        variant: 'perturbed',
        referenceId: 'l4',
      })
    }
    if (primed.l5) {
      perturbed.push({
        id: 'l5-prime',
        label: 'L5′',
        positionKm: primed.l5,
        variant: 'perturbed',
        referenceId: 'l5',
      })
    }
    return [...classical, ...perturbed]
  }
  const sun = vecNormalize(sunFromEarth.value)
  return [
    { id: 'earth', label: 'Earth', positionKm: { x: 0, y: 0, z: 0 } },
    {
      id: 'nose',
      label: 'magnetopause',
      positionKm: vecScale(sun, cavity.value.noseRe * R_EARTH_KM),
    },
  ]
})

function formatAccel(kmPerS2: number): string {
  const ms2 = kmPerS2 * 1000
  if (ms2 === 0) return '0 m/s²'
  const abs = Math.abs(ms2)
  if (abs >= 100 || abs < 0.01) return `${ms2.toExponential(2)} m/s²`
  return `${ms2.toFixed(3)} m/s²`
}

function formatB(nT: number): string {
  if (nT >= 1000) return `${(nT / 1000).toFixed(2)} μT`
  if (nT >= 10) return `${nT.toFixed(1)} nT`
  return `${nT.toFixed(2)} nT`
}

function formatDilation(ns: number): string {
  const rounded = Math.round(ns)
  return `${rounded.toLocaleString()} ns/day vs ∞`
}

function describe(
  ecl: Vec3,
  snap: string | null,
): { strength: string; dilation?: string; hint?: string } {
  const bodies = [
    { gmKm3s2: cr3bp.value.gm1, positionKm: { x: 0, y: 0, z: 0 }, radiusKm: R_EARTH_KM },
    {
      gmKm3s2: cr3bp.value.gm2,
      positionKm: cr3bp.value.moonFromEarthKm,
      radiusKm: R_MOON_KM,
    },
  ]
  let dilation: string | undefined
  const hint = snap ? features.value.find((feature) => feature.id === snap)?.label : undefined
  const rEarth = Math.hypot(ecl.x, ecl.y, ecl.z)
  const rMoon = Math.hypot(
    ecl.x - cr3bp.value.moonFromEarthKm.x,
    ecl.y - cr3bp.value.moonFromEarthKm.y,
    ecl.z - cr3bp.value.moonFromEarthKm.z,
  )
  if (mode.value === 'gravity') {
    dilation = formatDilation(redshiftNsPerDay(gravitationalPotential(bodies, ecl)))
    if (rEarth < R_EARTH_KM || rMoon < R_MOON_KM) {
      return { strength: '|∇U| (inside body)', dilation, hint }
    }
    const g = effectivePotentialGradient(cr3bp.value, ecl)
    const mag = Math.hypot(g.x, g.y, g.z)
    return { strength: `|∇U| ${formatAccel(mag)}`, dilation, hint }
  }
  if (rEarth < R_EARTH_KM) {
    return { strength: '|B| (inside Earth)', dilation, hint }
  }
  if (!insideMagnetopause(ecl, sunFromEarth.value, solarWind.value)) {
    return { strength: 'solar wind', dilation, hint }
  }
  const b = magnetosphereField(dipole.value, ecl, sunFromEarth.value, solarWind.value)
  return { strength: `|B| ${formatB(Math.hypot(b.x, b.y, b.z))}`, dilation, hint }
}

function onProbe(km: Vec3 | null, snap: string | null) {
  cursor.value = km ? describe(km, snap) : null
}

async function onPin(km: Vec3, snap: string | null) {
  const row = describe(km, snap)
  pins.value = [{ key: crypto.randomUUID(), ...row }, ...pins.value].slice(0, MAX_PINS)
  await readoutRef.value?.notifyPinned()
}

function removePin(index: number) {
  pins.value = pins.value.filter((_, i) => i !== index)
}

const moonDistanceKm = computed(() => cr3bp.value.separationKm)
const standoffRe = computed(() => cavity.value.noseRe)
const pressureLabel = computed(() => {
  const sample = windSample.value
  const p = `${sample.pdynNPa.toFixed(2)} nPa`
  if (!sample.omniDay) return `${p} (quiet mean)`
  const day = sample.omniDay.toISOString().slice(0, 10)
  return sample.held ? `${p} (OMNI through ${day})` : `${p} (OMNI ${day})`
})

function seekEpoch(at: Date) {
  live.value = false
  viewed.value = at
}
</script>

<template>
  <div class="page">
    <div class="studio">
      <section class="studio__stage" aria-label="Field geometry">
        <FieldsView
          :snapshot="snapshot"
          :mode="mode"
          :camera="camera"
          :view-radius-au="viewRadiusAu"
          :cr3bp="cr3bp"
          :dipole="dipole"
          :sun-from-earth="sunFromEarth"
          :features="features"
          :live="live"
          :solar-wind="solarWind"
          @update:camera="camera = $event"
          @update:view-radius-au="viewRadiusAu = $event"
          @probe="onProbe"
          @pin="onPin"
          @reset="resetCamera"
        />
        <FieldReadout ref="readoutRef" :cursor="cursor" :pins="pins" @remove="removePin" />
      </section>
    </div>
    <section class="readout" aria-label="Field model readout">
      <header class="readout__header">
        <h2 class="readout__title">This model</h2>
        <button
          type="button"
          class="help-btn"
          :aria-expanded="helpOpen"
          aria-controls="fields-help"
          @click="helpOpen = !helpOpen"
        >
          ?
        </button>
      </header>
      <div class="mode-row">
        <button
          type="button"
          class="mode-btn"
          :class="{ 'mode-btn--on': mode === 'gravity' }"
          @click="setMode('gravity')"
        >
          Gravity
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ 'mode-btn--on': mode === 'magnetism' }"
          @click="setMode('magnetism')"
        >
          Magnetism
        </button>
        <button type="button" class="reset" @click="resetCamera">Reset camera</button>
      </div>
      <div v-if="mode === 'magnetism'" class="wind-strip-wrap">
        <WindStrip :at="viewed" @seek="seekEpoch" />
      </div>
      <dl class="facts">
        <div>
          <dt>Frame</dt>
          <dd>{{ mode === 'gravity' ? 'Osculating synodic' : 'Body dipole, Sun-aligned tail' }}</dd>
        </div>
        <div v-if="mode === 'gravity'">
          <dt>Earth–Moon</dt>
          <dd>{{ Math.round(moonDistanceKm).toLocaleString() }} km</dd>
        </div>
        <div v-else>
          <dt>Magnetopause nose</dt>
          <dd>{{ standoffRe.toFixed(1) }} R_E</dd>
        </div>
        <div v-if="mode === 'magnetism'">
          <dt>Solar wind</dt>
          <dd>{{ pressureLabel }}</dd>
        </div>
        <div>
          <dt>Redshift</dt>
          <dd>Φ/c² vs infinity</dd>
        </div>
      </dl>
      <div v-show="helpOpen" id="fields-help" class="help">
        <p>
          Gravity mode is the circular restricted three-body problem at the current Earth–Moon
          distance. The camera rides the Earth–Moon line so L1–L5 sit still, with the Sun added as a
          tide at the epoch's Sun angle. The contour sheet is effective potential (gravity plus
          centrifugal plus solar tide). Only the tide enters: the Sun's direct pull is canceled by
          Earth's own fall toward it, and what survives runs about 1% of Earth's grip on the Moon —
          enough to flex the outer contours as the Sun works around the synodic month. Field
          strength on the pointer is |∇U_eff|. Gold L4 and L5 preserve the textbook references;
          violet L4′ and L5′ are instantaneous stationary points of this Sun-perturbed contour
          sheet, with dashed tethers showing their displacement. The primed points can swing
          rapidly, but they are not stable parking places or trajectories because the Sun angle
          keeps changing. Time dilation is Newtonian gravitational redshift vs a clock at infinity —
          it does not include the centrifugal term or the tide, so it is not the same function as
          the wells.
        </p>
        <p>
          Magnetism is a tilted centered dipole plus a Harris current sheet that stretches the outer
          field into lobes, clipped to a textbook magnetosphere: a Shue dayside cavity and a
          cylindrical tail. The sheet is a shape, not MHD — it is under 1% of the field inside 3
          Earth radii and only takes over near the magnetopause. Daily OMNI dynamic pressure scales
          the Shue nose and the lobe strength (Bz is omitted). |B| is omitted in the solar wind. The
          camera rides in a solar frame here rather than a sidereal one, swinging with the Sun as
          the epoch advances so the dayside and the tail stay where you left them. Drag to orbit,
          scroll to zoom, click to pin samples. Switching modes retargets zoom; the jump is instant
          when you prefer reduced motion.
        </p>
      </div>
    </section>
    <RouterLink class="nav-pill" :to="{ name: 'earth-system' }">← Earth</RouterLink>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.studio__stage {
  position: relative;
  min-width: 0;
}

.readout__header {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
}

.readout__title {
  margin: 0;
  color: $color-text-muted;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.help-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: 1px solid $color-border;
  border-radius: 50%;
  background: none;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.help-btn:hover,
.help-btn:focus-visible,
.help-btn[aria-expanded='true'] {
  color: $color-text;
  border-color: color-mix(in srgb, $color-accent 55%, $color-border);
  outline: none;
}

.mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
}

.wind-strip-wrap {
  margin: 0 0 $spacing-md;
}

.mode-btn,
.reset {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: none;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.mode-btn--on {
  color: $color-text;
  border-color: color-mix(in srgb, $color-accent 55%, $color-border);
}

.mode-btn:hover,
.mode-btn:focus-visible,
.reset:hover,
.reset:focus-visible {
  color: $color-text;
  outline: none;
}

.facts {
  display: grid;
  gap: $spacing-sm $spacing-lg;
  margin: 0;
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
}

.facts dt {
  color: $color-text-muted;
  font-size: 0.7rem;
}

.facts dd {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
}

.help p {
  margin: $spacing-md 0 0;
  color: $color-text-muted;
  font-size: 0.75rem;
  line-height: 1.45;
}
</style>
