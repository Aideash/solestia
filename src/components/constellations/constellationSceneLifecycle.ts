/**
 * Pure lifecycle policy for the constellation scene's tiny state machine. Kept
 * free of Three.js so the timing decisions can be exercised without a WebGL
 * context: the component owns the GPU work, this module owns the "when".
 */

/** The four states the scene moves through as selections come and go. */
export type SceneMode = 'overview' | 'toSlice' | 'slice' | 'toOverview'

/**
 * Whether a display remap (depth mode or projection stems changing) can run in
 * place right now. Only a settled slice may be remapped: during either fly-through
 * (`toSlice`/`toOverview`) an immediate rebuild would fight the running transition,
 * and in the plain overview there is no slice to remap. Callers that get `false`
 * should defer the rebuild until the slice settles.
 */
export function canRebuildInPlace(mode: SceneMode): boolean {
  return mode === 'slice'
}
