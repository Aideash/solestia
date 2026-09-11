<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

/** Deterministic faint field — enough points to read as depth without noise. */
const STARS = [
  [8, 28, 0.35],
  [14, 42, 0.2],
  [22, 18, 0.45],
  [28, 52, 0.15],
  [35, 34, 0.3],
  [41, 22, 0.55],
  [48, 46, 0.18],
  [55, 30, 0.4],
  [62, 40, 0.25],
  [68, 16, 0.5],
  [74, 50, 0.2],
  [82, 36, 0.35],
  [88, 24, 0.28],
  [12, 58, 0.12],
  [30, 62, 0.1],
  [52, 58, 0.14],
  [70, 56, 0.16],
  [90, 48, 0.22],
  [5, 48, 0.18],
  [95, 40, 0.3],
] as const

const DURATION_MS = 8000
/** Hold totality briefly, then move — kept short so the scene starts immediately. */
const HOLD_T = 0.04
/**
 * Sun sits at cy=42 so third contact stays well inside the visible band when
 * `slice` crops a square viewBox on wide screens (~y 22–78).
 */
const SUN_CY = 25
const PLANET_START_Y = SUN_CY - 112
const PLANET_CY = 112
const PLANET_R = 44
/** Final shadow offset that yields the resting crescent thickness. */
const CRESCENT_SHADOW_END = 13

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const planetY = ref(reduceMotion ? 0 : PLANET_START_Y)
const sunOpacity = ref(reduceMotion ? 1 : 0)
const sunGlowOpacity = ref(reduceMotion ? 1 : 0)
const diamondOpacity = ref(0)
/** Shadow disc offset from planet center — grows the lit crescent from a thin limb. */
const crescentShadow = ref(reduceMotion ? CRESCENT_SHADOW_END : 0)
const contentOpacity = ref(reduceMotion ? 1 : 0)

const crescentShadowCy = computed(() => PLANET_CY + planetY.value + crescentShadow.value)
const crescentPlanetCy = computed(() => PLANET_CY + planetY.value)

let frame = 0

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function sample(t: number, times: number[], values: number[]): number {
  if (t <= times[0]) return values[0]
  if (t >= times[times.length - 1]) return values[values.length - 1]
  for (let i = 1; i < times.length; i++) {
    if (t <= times[i]) {
      const u = (t - times[i - 1]) / (times[i] - times[i - 1])
      return values[i - 1] + (values[i] - values[i - 1]) * u
    }
  }
  return values[values.length - 1]
}

function tick(now: number, start: number): void {
  const t = Math.min(1, (now - start) / DURATION_MS)

  const reveal = t <= HOLD_T ? 0 : easeOutCubic((t - HOLD_T) / (1 - HOLD_T))
  planetY.value = PLANET_START_Y * (1 - reveal)

  // Lit crescent grows from a hairline after third contact — not a fade.
  // crescentShadow.value = sample(
  //   t,
  //   [0, 0.3, 0.4, 0.58, 0.82, 1],
  //   [0, 0, 2, 7, CRESCENT_SHADOW_END, CRESCENT_SHADOW_END],
  // )
  crescentShadow.value = sample(
    t,
    [0, 0.1, 0.2, 0.38, 0.42, 1],
    [0, 2, 5, 7, CRESCENT_SHADOW_END, CRESCENT_SHADOW_END],
  )

  sunOpacity.value = sample(t, [0, 0.2, 0.3, 0.45, 1], [0, 0, 0.7, 1, 1])
  sunGlowOpacity.value = sample(t, [0, 0.18, 0.32, 0.5, 1], [0, 0, 0.5, 1, 1])
  // Peak as the upper limb clears the sun — bead rides the planet rim on-screen.
  diamondOpacity.value = sample(
    t,
    [0, 0.18, 0.22, 0.28, 0.36, 0.44, 1],
    [0, 0, 1, 0.95, 0.18, 0, 0],
  )
  contentOpacity.value = sample(t, [0, 0.4, 0.58, 1], [0, 0, 1, 1])

  if (t < 1) frame = window.requestAnimationFrame((n) => tick(n, start))
}

onMounted(() => {
  if (reduceMotion) return
  const start = performance.now()
  frame = window.requestAnimationFrame((n) => tick(n, start))
})

onUnmounted(() => {
  window.cancelAnimationFrame(frame)
})
</script>

<template>
  <main class="home">
    <svg
      class="home__scene"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="home-void" cx="50%" cy="40%" r="75%">
          <stop offset="0%" stop-color="#0a0e18" />
          <stop offset="55%" stop-color="#04060c" />
          <stop offset="100%" stop-color="#010204" />
        </radialGradient>
        <radialGradient id="home-sun-glow" cx="50%" cy="42%" r="32%">
          <stop offset="0%" stop-color="#fff4d0" stop-opacity="0.75" />
          <stop offset="22%" stop-color="#ffd078" stop-opacity="0.32" />
          <stop offset="48%" stop-color="#c87828" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="sun-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff7b00" data-v-9b48b94e=""></stop>
          <stop offset="70%" stop-color="#ffe8b0" data-v-9b48b94e=""></stop>
          <stop offset="100%" stop-color="#ffe8b000" data-v-9b48b94e=""></stop>
        </radialGradient>
        <radialGradient id="home-diamond" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
          <stop offset="12%" stop-color="#fff8e0" stop-opacity="1" />
          <stop offset="40%" stop-color="#ffd078" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#ffd078" stop-opacity="0" />
        </radialGradient>
        <mask id="home-crescent-mask">
          <rect width="100" height="100" fill="black" />
          <!-- Mask is in root user space — track the planet's translated disc. -->
          <circle cx="50" :cy="crescentPlanetCy" :r="PLANET_R" fill="white" />
          <!-- Same radius as the disc: offset alone grows the crescent (no annular ring at 0). -->
          <circle cx="50" :cy="crescentShadowCy" :r="PLANET_R" fill="black" />
        </mask>
        <linearGradient id="home-crescent-lit" x1="0%" y1="0%" x2="0%" y2="100%">
          <!-- <stop offset="0%" stop-color="#f7ecd0" />
          <stop offset="10%" stop-color="#c4a878" />
          <stop offset="30%" stop-color="#6a5840" /> -->
          <stop data-v-9b48b94e="" offset="0%" stop-color="#f7ecd0" style="stop-color: #bad2fa" />
          <stop data-v-9b48b94e="" offset="10%" stop-color="#c4a878" style="stop-color: #499eff" />
          <stop data-v-9b48b94e="" offset="30%" stop-color="#6a5840" style="stop-color: #0077ff" />
        </linearGradient>
      </defs>

      <rect width="100" height="100" fill="url(#home-void)" />

      <g class="home__stars">
        <circle
          v-for="([x, y, o], i) in STARS"
          :key="i"
          class="home__star"
          :cx="x"
          :cy="y"
          r="0.28"
          :fill="`rgba(230, 236, 255, ${o})`"
          :style="{ '--star-delay': `${(i % 7) * 0.7}s`, '--star-base': String(o) }"
        />
      </g>

      <ellipse
        class="home__sun-glow"
        cx="50"
        :cy="SUN_CY"
        rx="38"
        ry="26"
        fill="url(#home-sun-glow)"
        :opacity="sunGlowOpacity"
      />
      <circle class="home__sun" cx="50" :cy="SUN_CY" r="7.5" fill="#fff8e0" :opacity="sunOpacity" />
      <circle
        class="home__sun-halo"
        cx="50"
        :cy="SUN_CY"
        r="12"
        fill="url(#sun-halo)"
        :opacity="sunOpacity * 0.22"
      />

      <g class="home__planet" :transform="`translate(0 ${planetY})`">
        <circle cx="50" :cy="PLANET_CY" :r="PLANET_R" fill="#050504" />
        <circle
          class="home__crescent"
          cx="50"
          :cy="PLANET_CY"
          :r="PLANET_R"
          fill="url(#home-crescent-lit)"
          mask="url(#home-crescent-mask)"
        />
        <!-- Diamond ring rides the upper limb so it stays on-screen at third contact. -->
        <g
          class="home__diamond"
          :opacity="diamondOpacity"
          :transform="`translate(50 ${PLANET_CY - PLANET_R})`"
        >
          <circle cx="0" cy="0" r="10" fill="url(#home-diamond)" />
          <circle cx="0" cy="0" r="1.8" fill="#ffffff" />
          <line
            x1="0"
            y1="-6"
            x2="0"
            y2="6"
            stroke="#fff8e8"
            stroke-width="0.45"
            stroke-linecap="round"
            opacity="0.95"
          />
          <line
            x1="-7"
            y1="0"
            x2="7"
            y2="0"
            stroke="#fff8e8"
            stroke-width="0.3"
            stroke-linecap="round"
            opacity="0.8"
          />
        </g>
      </g>
    </svg>

    <div class="home__content" :style="{ opacity: contentOpacity }">
      <p class="home__brand">Solestia</p>
      <nav class="home__nav" aria-label="Destinations">
        <RouterLink class="home__link" :to="{ name: 'solar' }">Orrery</RouterLink>
        <RouterLink class="home__link" :to="{ name: 'constellations' }">Constellations</RouterLink>
      </nav>
    </div>
  </main>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.home {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background: #010204;
}

.home__scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.home__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-xl;
  min-height: inherit;
  padding: 6rem $spacing-md 10rem;
  text-align: center;
}

.home__brand {
  margin: 0;
  font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
  font-size: clamp(2.75rem, 9vw, 5.5rem);
  font-weight: 400;
  letter-spacing: 0.08em;
  color: #f2f0ea;
  text-shadow:
    0 0 40px rgba(1, 2, 4, 0.9),
    0 2px 24px rgba(0, 0, 0, 0.55);
}

.home__nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: $spacing-lg $spacing-xl;
}

.home__link {
  color: rgba(232, 237, 247, 0.72);
  font-size: 1.05rem;
  letter-spacing: 0.12em;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  padding-bottom: 0.15rem;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
}

.home__link:hover,
.home__link:focus-visible {
  color: #fff8e8;
  border-bottom-color: rgba(255, 214, 140, 0.55);
  outline: none;
}

@media (prefers-reduced-motion: no-preference) {
  .home__star {
    animation: home-twinkle 5.5s ease-in-out infinite;
    animation-delay: calc(6s + var(--star-delay, 0s));
  }
}

@keyframes home-twinkle {
  0%,
  100% {
    opacity: var(--star-base, 0.3);
  }
  50% {
    opacity: calc(var(--star-base, 0.3) * 0.35);
  }
}
</style>
