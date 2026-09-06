import type { InjectionKey, Ref } from 'vue'

/**
 * How often the live clock steps forward, so a page showing a clock whose
 * seconds are not SI seconds can make the whole app keep that clock's time.
 */
export type LiveCadence = {
  /** Milliseconds in one tick of the clock's finest unit. */
  tickMs: number
  /**
   * Milliseconds elapsed in the clock's own day frame, used to land each tick on
   * a unit boundary rather than wherever the timer happened to start.
   */
  frameMs?: (at: Date) => number
}

export const SI_SECOND_CADENCE: LiveCadence = { tickMs: 1000 }

export type EpochContext = {
  viewed: Ref<Date>
  live: Ref<boolean>
  selectedId: Ref<string | null>
  cadence: Ref<LiveCadence>
}

export const epochKey: InjectionKey<EpochContext> = Symbol('epoch')
