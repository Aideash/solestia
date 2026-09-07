<script setup lang="ts">
import { inject } from 'vue'
import { RouterLink } from 'vue-router'
import EpicycleView from '../components/EpicycleView.vue'
import { epochKey } from '../epoch.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')
</script>

<template>
  <main class="page">
    <header class="introduction">
      <p>
        Ptolemy’s eccentric deferent, equant, and epicycles can imitate the wandering Sun, Moon, and
        planets surprisingly well. These models minimize angular error against observed direction
        from 1800–2050: their drawn sizes are illustrative, and their distance estimates are
        consequences rather than construction inputs.
      </p>
    </header>

    <EpicycleView :at="epoch.viewed.value" />

    <aside class="method">
      <h2>What is being compared</h2>
      <p>
        “Actual” is the geometric geocentric ecliptic longitude from Solestia’s Kepler model,
        measured from Earth’s center in the J2000 ecliptic. It omits light-time, aberration,
        refraction, and an observer’s location.
      </p>
      <p>
        J2000 is the phase epoch, but the eccentricity, apsidal direction, radii, and phases
        minimize wrapped longitude error across the full 1800–2050 window; no date is forced to
        match exactly. The primary circle is an eccentric deferent with a bisected equant, and the
        lunar apsis precesses at its mean-element rate. Added circles refine that construction.
        Modern-mean distance gives the angle-only model one scale factor; Ptolemaic distance maps
        its cycle onto the sphere ranges in the
        <cite>Planetary Hypotheses</cite>. The multi-circle drawing compresses those touching shells
        so all seven bodies remain visible.
      </p>
    </aside>

    <RouterLink class="back" :to="{ name: 'earth-system' }">← Earth system</RouterLink>
  </main>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.page {
  padding-bottom: $spacing-lg;
}

.introduction,
.method {
  width: min(100%, 42rem);
  margin-right: auto;
  margin-left: auto;
}

.introduction {
  margin-bottom: $spacing-lg;
}

.introduction p,
.method p {
  color: $color-text-muted;
  font-size: 0.82rem;
  line-height: 1.65;
}

.introduction p {
  margin: 0;
}

.method {
  margin-top: $spacing-xl;
  padding-top: $spacing-md;
  border-top: 1px solid $color-border;
}

.method h2 {
  margin: 0 0 $spacing-sm;
  font-size: 0.9rem;
  font-weight: 600;
}

.method p {
  margin: 0 0 $spacing-sm;
}

.back {
  display: block;
  width: fit-content;
  margin: $spacing-xl auto 0;
  color: $color-text-muted;
  font-size: 0.75rem;
  text-decoration: none;
}

.back:hover,
.back:focus-visible {
  color: $color-text;
  outline: none;
}
</style>
