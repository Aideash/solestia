import { wrapRad, type EdgeOnPoint, type Vec3 } from './kepler.ts'

export type CameraPose = {
  /** Unit vector the camera looks along, into the scene (positive depth is far). */
  look: Vec3
  /** Approximate up; rebuilt if it is parallel to `look`. */
  up: Vec3
}

/**
 * Look direction on a spherical shell, in ecliptic-of-J2000 spherical
 * coordinates. Radius is unused: the projector is orthographic.
 */
export type ShellCamera = {
  /** Ecliptic longitude of the look vector, radians. */
  longitude: number
  /** Ecliptic latitude of the look vector, radians. */
  latitude: number
}

export type CameraFrame = 'sidereal' | 'solar'

/**
 * `normal` drags the scene: whatever is nearest the camera follows the
 * pointer. `inverted` drags the camera, so the near side moves against it.
 */
export type DragDirection = 'normal' | 'inverted'

const POLE_LIMIT = Math.PI / 2 - 0.02

function hypot3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function vecNormalize(v: Vec3): Vec3 {
  const length = hypot3(v)
  if (length < 1e-18) return { x: 0, y: 0, z: 0 }
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

/** Edge-on ecliptic: look along Earth perihelion, ecliptic north up. */
export function defaultShellCamera(earthPerihelionLongitude: number): ShellCamera {
  return { longitude: earthPerihelionLongitude, latitude: 0 }
}

export function shellLook(camera: ShellCamera): Vec3 {
  const cosLat = Math.cos(camera.latitude)
  return {
    x: cosLat * Math.cos(camera.longitude),
    y: cosLat * Math.sin(camera.longitude),
    z: Math.sin(camera.latitude),
  }
}

export function shellPose(camera: ShellCamera): CameraPose {
  return { look: shellLook(camera), up: { x: 0, y: 0, z: 1 } }
}

/**
 * Apply a pointer drag, given as radians of screen sweep to the right and
 * down. The camera swings against the drag on both axes, so the near side of
 * the scene is what tracks the pointer.
 */
export function dragShellCamera(camera: ShellCamera, dragX: number, dragY: number): ShellCamera {
  return {
    longitude: wrapRad(camera.longitude - dragX),
    latitude: Math.max(POLE_LIMIT * -1, Math.min(POLE_LIMIT, camera.latitude - dragY)),
  }
}

export function cameraAxes(pose: CameraPose): { look: Vec3; right: Vec3; up: Vec3 } {
  const look = vecNormalize(pose.look)
  let right = vecCross(look, pose.up)
  if (hypot3(right) < 1e-8) {
    right = vecCross(look, { x: 1, y: 0, z: 0 })
    if (hypot3(right) < 1e-8) right = vecCross(look, { x: 0, y: 1, z: 0 })
  }
  right = vecNormalize(right)
  const up = vecNormalize(vecCross(right, look))
  return { look, right, up }
}

/**
 * Orthographic camera of a radially scaled model, matching `projectEdgeOn`:
 * compress the true 3-D distance, then take screen components of that vector.
 */
export function projectOrthographic(
  cx: number,
  cy: number,
  position: Vec3,
  pose: CameraPose,
  scale: (distance: number) => number,
): EdgeOnPoint {
  const { look, right, up } = cameraAxes(pose)
  const distance = hypot3(position)
  if (distance < 1e-12) return { x: cx, y: cy, depth: vecDot(position, look) }
  const radius = scale(distance)
  const inv = 1 / distance
  return {
    x: cx + radius * vecDot(position, right) * inv,
    y: cy - radius * vecDot(position, up) * inv,
    depth: vecDot(position, look),
  }
}

/** Linear map so `maxDistance` lands on `outerR`. */
export function linearDistanceScale(
  maxDistance: number,
  outerR: number,
): (distance: number) => number {
  if (maxDistance <= 0) return () => 0
  const k = outerR / maxDistance
  return (distance) => distance * k
}
