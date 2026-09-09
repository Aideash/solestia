/**
 * Pointer-drag sign conventions for the constellation viewer. Kept free of
 * Three.js so overview yaw/pitch deltas and slice orbit speed can be checked
 * without a WebGL context.
 */

export type ConstellationDragMode = 'normal' | 'inverted'

/** Radians of yaw/pitch per pixel of pointer movement. */
export const OVERVIEW_ROTATE_SPEED = 0.0045

export type OverviewDragInput = {
  readonly movementX: number
  readonly movementY: number
  readonly mode: ConstellationDragMode
}

export type OverviewDragDelta = {
  readonly yawDelta: number
  readonly pitchDelta: number
}

/**
 * Map a pointer-move delta onto overview camera yaw/pitch.
 *
 * The camera sits at Earth and looks outward. Increasing yaw swings the view
 * left (sky moves right); increasing pitch tilts the view up (sky moves down).
 * Normal mode therefore follows the cursor (grab-the-sky); inverted reverses
 * both axes.
 */
export function overviewDragDelta(input: OverviewDragInput): OverviewDragDelta {
  const sign = input.mode === 'inverted' ? -1 : 1
  return {
    yawDelta: sign * input.movementX * OVERVIEW_ROTATE_SPEED + 0,
    pitchDelta: sign * input.movementY * OVERVIEW_ROTATE_SPEED + 0,
  }
}

/** OrbitControls rotateSpeed: grab-the-object in normal, the opposite when inverted. */
export function orbitRotateSpeed(mode: ConstellationDragMode): number {
  return mode === 'inverted' ? -1 : 1
}
