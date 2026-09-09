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

/**
 * Whether `applyTransitionProgress` should lerp the camera. Only the fly-in and
 * fly-out own camera motion. A settled-slice remap (depth mode / stems) must
 * leave the user's orbit pose alone — otherwise toggling Depth looks like it
 * "fixes" a zoom bug by secretly snapping the camera home.
 */
export function shouldAnimateCamera(mode: SceneMode): boolean {
  return mode === 'toSlice' || mode === 'toOverview'
}
