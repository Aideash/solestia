<script setup lang="ts">
defineSlots<{
  inner(): unknown
  center(): unknown
  controls(): unknown
  outer(): unknown
}>()
</script>

<template>
  <div class="stage">
    <div class="stage__dials stage__dials--inner">
      <slot name="inner" />
    </div>
    <div class="stage__center">
      <slot name="center" />
      <div class="stage__controls">
        <slot name="controls" />
      </div>
    </div>
    <div class="stage__dials stage__dials--outer">
      <slot name="outer" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

$center-width: 32rem;
$flanked-width: 78rem;

.stage {
  display: grid;
  justify-content: center;
  gap: $spacing-lg;
  grid-template-columns: minmax(0, $center-width);
  grid-template-areas:
    'center'
    'inner'
    'outer';
}

.stage__center {
  grid-area: center;
  min-width: 0;
}

.stage__dials {
  display: grid;
  gap: $spacing-md;
  grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
}

.stage__dials--inner {
  grid-area: inner;
}

.stage__dials--outer {
  grid-area: outer;
}

.stage__controls {
  direction: rtl;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: $spacing-md;

  > * {
    direction: ltr;
  }
}

@media (min-width: $flanked-width) {
  .stage {
    grid-template-columns: 1fr minmax(0, $center-width) 1fr;
    grid-template-areas: 'inner center outer';
    align-items: start;
  }

  .stage__dials {
    grid-template-columns: 1fr;
    gap: $spacing-lg;
    z-index: 1001; // Above header
  }

  .stage__dials > * {
    max-width: 11rem;
    justify-self: center;
  }
}
</style>
