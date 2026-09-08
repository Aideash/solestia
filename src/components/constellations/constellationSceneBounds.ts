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
 */
export function sliceOrbitMinDistance(cameraNear: number, targetRadius: number): number {
  const nearClearance = Math.max(cameraNear, 0) * 10
  const inspectFloor = Math.max(targetRadius, 0) * 0.05
  return Math.max(nearClearance, inspectFloor, 1)
}
