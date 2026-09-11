import type { Vec3 } from '../kepler.ts'

/**
 * Pure timing and orientation helpers for constellation scene camera transitions.
 * Kept free of Three.js so fly-out phasing and Earth-view yaw/pitch can be tested
 * without a WebGL context.
 */

/** Fraction of the deselect timeline spent rotating to the Earth line of sight. */
export const DESELECT_REORIENT_END = 0.35

export type YawPitch = {
  readonly yaw: number
  readonly pitch: number
}

export type DeselectPhaseWeights = {
  /** 0→1 while rotating onto the Earth line of sight; stays 1 afterward. */
  readonly reorient: number
  /** 0 during reorient; 0→1 while zooming home and morphing onto the sphere. */
  readonly zoomMorph: number
}

export function easeInOutCubic(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function unitProgress(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0
  return clamp((t - start) / (end - start), 0, 1)
}

/**
 * Convert a unit look direction into the overview yaw/pitch pair used by the
 * Earth-centered camera (`cos(pitch)*cos(yaw)`, `cos(pitch)*sin(yaw)`, `sin(pitch)`).
 */
export function yawPitchFromDirection(direction: Vec3): YawPitch {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (!(length > 1e-8)) return { yaw: 0, pitch: 0 }
  const x = direction.x / length
  const y = direction.y / length
  const z = direction.z / length
  return {
    yaw: Math.atan2(y, x),
    pitch: Math.asin(clamp(z, -1, 1)),
  }
}

/**
 * Camera position for a front-facing Earth view of the slice: on `-depth` at
 * `distance`, looking toward the constellation center.
 */
export function frontFacingCameraOffset(
  depth: Vec3,
  distance: number,
  fallbackDistance = 144,
): Vec3 {
  const resolved =
    Number.isFinite(distance) && distance > 1e-6
      ? distance
      : Number.isFinite(fallbackDistance) && fallbackDistance > 1e-6
        ? fallbackDistance
        : 144
  const length = Math.hypot(depth.x, depth.y, depth.z)
  if (!(length > 1e-8)) return { x: 0, y: 0, z: -resolved }
  const scale = -resolved / length
  return { x: depth.x * scale, y: depth.y * scale, z: depth.z * scale }
}

export type EarthPovCameraOffsetInput = {
  readonly depthMode: 'true' | 'compressed'
  /** Slice-space position of Earth relative to the orbit target (centroid). */
  readonly earthWorld: Vec3
  /** Unit sky direction; used when Earth is unavailable or depth is compressed. */
  readonly depth: Vec3
  readonly currentDistance: number
  readonly fallbackDistance?: number
}

/**
 * Camera pose for the Earth POV control.
 *
 * True scale places the camera at the geometric Earth offset so the constellation
 * matches the sky view. Compressed depth remaps stellar z while leaving Earth at
 * local z = 0, so that offset is not a meaningful viewing distance — reorient on
 * `-depth` at the current orbit radius instead of chasing it.
 */
export function earthPovCameraOffset(input: EarthPovCameraOffsetInput): Vec3 {
  const fallback = input.fallbackDistance ?? 144
  if (input.depthMode === 'true') {
    const length = Math.hypot(input.earthWorld.x, input.earthWorld.y, input.earthWorld.z)
    if (length > 1e-6) {
      return { x: input.earthWorld.x, y: input.earthWorld.y, z: input.earthWorld.z }
    }
  }
  return frontFacingCameraOffset(input.depth, input.currentDistance, fallback)
}

/** Split a 0→1 deselect timeline into reorient then zoom/morph weights. */
export function deselectPhaseWeights(
  t: number,
  reorientEnd: number = DESELECT_REORIENT_END,
): DeselectPhaseWeights {
  const clamped = clamp(t, 0, 1)
  return {
    reorient: unitProgress(clamped, 0, reorientEnd),
    zoomMorph: unitProgress(clamped, reorientEnd, 1),
  }
}

/**
 * Morph mix for deselect: 1 = slice placement, 0 = celestial-sphere placement.
 * Stays on the slice through reorient, then eases onto the sky during zoom.
 */
export function deselectMorphAmount(
  t: number,
  reorientEnd: number = DESELECT_REORIENT_END,
): number {
  const { zoomMorph } = deselectPhaseWeights(t, reorientEnd)
  return 1 - easeInOutCubic(zoomMorph)
}

/**
 * Overview opacity blend amount for deselect: 0 = stay dim, 1 = fully restored.
 * Restores only during the zoom/morph phase.
 */
export function deselectOpacityAmount(
  t: number,
  reorientEnd: number = DESELECT_REORIENT_END,
): number {
  const { zoomMorph } = deselectPhaseWeights(t, reorientEnd)
  return easeInOutCubic(zoomMorph)
}
