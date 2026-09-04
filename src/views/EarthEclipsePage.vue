<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import EclipseGeometryView from '../components/EclipseGeometryView.vue'
import EclipseGlobeView from '../components/EclipseGlobeView.vue'
import { epochKey } from '../epoch.ts'
import {
  defaultShellCamera,
  type CameraFrame,
  type DragDirection,
  type ShellCamera,
} from '../lib/camera.ts'
import {
  LUNAR_LONGITUDE_ENVELOPE_RAD,
  activeHit,
  eclipseGeometryFromSnapshot,
  envelopeHitSamples,
  kindColor,
  kindLabel,
  type ShadowCaster,
} from '../lib/eclipses.ts'
import { formatDeg, formatFineDeg } from '../lib/format.ts'
import { planetSystemAt, wrapRad, wrapRadSigned } from '../lib/kepler.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const viewed = epoch.viewed
const snapshot = computed(() => planetSystemAt(viewed.value, 'earth'))
const geometry = computed(() => eclipseGeometryFromSnapshot(snapshot.value))

const camera = ref<ShellCamera>(defaultShellCamera(snapshot.value.earthPerihelionLongitude))
const cameraFrame = ref<CameraFrame>('solar')
const dragDirection = ref<DragDirection>('normal')
const caster = ref<ShadowCaster>('moon')
const showEnvelope = ref(true)
const helpOpen = ref(false)

const sunLongitude = computed(() =>
  Math.atan2(geometry.value.sunFromEarth.y, geometry.value.sunFromEarth.x),
)

watch(sunLongitude, (longitude, previous) => {
  if (previous === undefined || cameraFrame.value !== 'solar') return
  camera.value = {
    ...camera.value,
    longitude: wrapRad(camera.value.longitude + wrapRadSigned(longitude - previous)),
  }
})

function resetCamera() {
  camera.value = defaultShellCamera(snapshot.value.earthPerihelionLongitude)
}

const SEASON_LIMIT = (18.5 * Math.PI) / 180
const inSeason = computed(() => geometry.value.sunNodeSeparation < SEASON_LIMIT)
const active = computed(() => activeHit(geometry.value, caster.value))
const hasEnvelope = computed(() => envelopeHitSamples(geometry.value, caster.value).length > 0)
const otherCaster = computed((): ShadowCaster => (caster.value === 'moon' ? 'earth' : 'moon'))
const other = computed(() => activeHit(geometry.value, otherCaster.value))
const envelopeDeg = ((LUNAR_LONGITUDE_ENVELOPE_RAD * 180) / Math.PI).toFixed(1)
</script>

<template>
  <div class="page">
    <div class="studio">
      <section class="studio__geometry" aria-label="Earth–Moon geometry">
        <EclipseGeometryView
          :snapshot="snapshot"
          :geometry="geometry"
          :camera="camera"
          :camera-frame="cameraFrame"
          :drag-direction="dragDirection"
          :caster="caster"
          :show-envelope="showEnvelope"
          :live="epoch.live.value"
          @update:camera="camera = $event"
          @update:camera-frame="cameraFrame = $event"
          @update:drag-direction="dragDirection = $event"
          @update:caster="caster = $event"
          @update:show-envelope="showEnvelope = $event"
          @reset="resetCamera"
        />
      </section>
      <section class="studio__globe" :aria-label="caster === 'moon' ? 'Earth disc' : 'Moon disc'">
        <EclipseGlobeView
          :snapshot="snapshot"
          :geometry="geometry"
          :camera="camera"
          :caster="caster"
          :show-envelope="showEnvelope"
        />
      </section>
    </div>
    <section class="readout" aria-label="Eclipse readout">
      <header class="readout__header">
        <h2 class="readout__title">This model</h2>
        <button
          type="button"
          class="help-btn"
          :aria-expanded="helpOpen"
          aria-controls="eclipse-help"
          @click="helpOpen = !helpOpen"
        >
          ?
        </button>
      </header>
      <dl class="facts">
        <div>
          <dt>Season</dt>
          <dd :class="{ green: inSeason }">
            {{ inSeason ? 'Near a node' : 'Outside eclipse season' }}
          </dd>
        </div>
        <div>
          <dt>Sun from node</dt>
          <dd>{{ formatDeg(geometry.sunNodeSeparation) }}</dd>
        </div>
        <div>
          <dt>Syzygy</dt>
          <dd>{{ formatDeg(geometry.syzygy) }}</dd>
        </div>
        <div>
          <dt>Apparent sizes</dt>
          <dd>
            Sun {{ formatFineDeg(geometry.sunApparent) }} · Moon
            {{ formatFineDeg(geometry.moonApparent) }}
          </dd>
        </div>
        <div>
          <dt>{{ caster === 'moon' ? 'Solar' : 'Lunar' }}</dt>
          <dd :class="kindColor(active.kind)">{{ kindLabel(active.kind, caster) }}</dd>
        </div>
        <div class="facts__other">
          <dt>{{ otherCaster === 'moon' ? 'Solar' : 'Lunar' }}</dt>
          <dd>{{ kindLabel(other.kind, otherCaster) }}</dd>
        </div>
      </dl>
      <p v-if="showEnvelope && hasEnvelope" class="envelope-note">
        Red shows how the shadow moves when the Moon slides ±{{ envelopeDeg }}° along its orbit.
        This is a provisional residual along-track range, deliberately still as wide as the former
        mean-ellipse allowance, not a catalog-calibrated 95% interval. The penumbra and the umbra
        get a band each, so every band contains the shadow it is named for, and one shows even where
        that shadow misses: an umbra band across an untouched
        {{ caster === 'moon' ? 'Earth' : 'Moon' }} is this model allowing that the eclipse could
        really be {{ caster === 'moon' ? 'total somewhere' : 'partial' }}. The bands are often wider
        than {{ caster === 'moon' ? 'Earth' : 'the Moon' }} itself.
      </p>
      <div v-show="helpOpen" id="eclipse-help" class="help">
        <p>
          This page draws compact Sun–Earth–Moon geometry at the epoch above, not a precision
          eclipse forecast. The Moon starts from a precessing mean ellipse and adds the principal
          lunar longitude, latitude, and distance inequalities. Earth’s heliocentric row is the
          Earth–Moon barycenter; the body positions shown here recover the geocenter from the lunar
          offset. This is much closer to historical eclipse paths, but still falls short of a
          numerical ephemeris.
        </p>
        <p>
          Umbra and penumbra come from one caster at a time: the Moon (solar, shadow on Earth) or
          Earth (lunar, shadow on the Moon). On the disc each is drawn where its cone actually meets
          the surface, so a total solar umbra is a spot a couple of hundred kilometers across that
          sweeps as the epoch advances, and a shadow past its apex is dashed: an annular antumbra.
          Apparent sizes are the angular radii seen from Earth. The Moon’s maria are ellipses
          bracketing each one’s coordinates in the IAU gazetteer, there to show which way the near
          side is facing, not to map where the basalt ends. Drag the geometry view to orbit an
          orthographic camera on a spherical shell; both discs share that look. Double-click or
          Reset camera returns to the edge-on pose (look along Earth’s perihelion, ecliptic north
          up). Sidereal keeps the camera fixed against the stars; Solar carries it around with the
          Sun so the rays stay fixed as the epoch changes. Normal drag carries the near side of the
          system with the pointer; inverted drag moves the camera instead.
        </p>
        <p>
          The optional red envelope is currently a conservative ±{{ envelopeDeg }}° of residual
          lunar ecliptic longitude. On the geometry view it is the track the Moon could be anywhere
          along; on the disc it is the band the shadow could fall anywhere within. It is not labeled
          95% until a broad historical catalog establishes that coverage. Longitude is only part of
          the error — residual latitude error can move a track without widening this band. Orbit
          elements use the same 1800–2050 fit as the orrery.
        </p>
      </div>
    </section>
    <RouterLink class="back" :to="{ name: 'earth-system' }">← Earth</RouterLink>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

$page-wide: 56rem;
$page-medium: 36rem;

.page {
  display: grid;
  gap: $spacing-lg;
}

.studio {
  display: grid;
  gap: $spacing-xl;
  grid-template-columns: minmax(0, 1fr);
}

.studio__geometry,
.studio__globe {
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

.facts {
  display: grid;
  gap: $spacing-sm $spacing-lg;
  margin: 0;
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
}

.facts div {
  min-width: 0;
}

.facts dt {
  color: $color-text-muted;
  font-size: 0.7rem;
}

.facts dd {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
}

.facts__other {
  opacity: 0.55;
}

.envelope-note,
.help p {
  margin: $spacing-md 0 0;
  color: $color-text-muted;
  font-size: 0.75rem;
  line-height: 1.45;
}

.help p + p {
  margin-top: $spacing-sm;
}

.back {
  display: block;
  color: var(--accent);
  font-size: 0.75rem;
  text-decoration: none;
  padding: 4px 10px;
  border: 1px solid var(--border);
  width: fit-content;
  border-radius: 10px;
}

.back:hover,
.back:focus-visible {
  color: var(--text);
  outline: none;
}

@media (min-width: $page-medium) {
  .studio {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
</style>
