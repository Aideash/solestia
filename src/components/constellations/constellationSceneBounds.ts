import { Line, LineSegments, Points, type Object3D } from 'three'

/**
 * Refresh cached geometry bounds after vertex morphs.
 *
 * Three.js frustum-culls against `geometry.boundingSphere`, which is computed
 * once and not invalidated when a position attribute is rewritten. The slice
 * fly-in morphs overview (sky) positions onto the local origin; without this
 * refresh, a side/back zoom keeps testing the stale sky sphere and drops the
 * entire selection even though the vertices are on screen.
 */
export function syncGeometryBounds(root: Object3D): void {
  root.traverse((object) => {
    if (object instanceof Points || object instanceof LineSegments || object instanceof Line) {
      object.geometry.computeBoundingSphere()
    }
  })
}

/**
 * Closest OrbitControls dolly distance for a settled slice. Must stay above the
 * perspective near plane so extreme zoom cannot clip the whole constellation.
 *
 * `focusDistance` is an optional closer stand (Earth POV). Deep true-scale
 * figures can place Earth inside the default inspect floor after fit-scale; if
 * minDistance stays at that floor, Earth POV animates in and OrbitControls
 * clamps the camera back out on `update()`.
 */
export function sliceOrbitMinDistance(
  cameraNear: number,
  targetRadius: number,
  focusDistance?: number,
): number {
  const nearClearance = Math.max(cameraNear, 0) * 10
  const inspectFloor = Math.max(targetRadius, 0) * 0.05
  const base = Math.max(nearClearance, inspectFloor, 1)
  if (!(typeof focusDistance === 'number') || !Number.isFinite(focusDistance) || focusDistance <= 0) {
    return base
  }
  if (focusDistance >= base) return base
  return Math.max(nearClearance, focusDistance)
}
