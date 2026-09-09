import { BufferAttribute, BufferGeometry, Frustum, Matrix4, PerspectiveCamera, Points } from 'three'
import { describe, expect, it } from 'vitest'
import {
  sliceOrbitMinDistance,
  syncGeometryBounds,
} from './constellationSceneBounds.ts'

/**
 * Reproduce the zoom-disappearance failure mode: morph moves vertices to the
 * slice origin, but a stale bounding sphere stays out on the overview sky.
 * From a side camera zoomed on the origin, frustum culling then drops the
 * object even though its vertices are on screen.
 */
function makeMorphedPoints(): Points {
  const geometry = new BufferGeometry()
  // Overview-like start: a patch on +Z (constellation depth from Earth).
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 100, 5, 0, 100, -5, 0, 100]), 3),
  )
  geometry.computeBoundingSphere()

  // Morph ends near the origin (slice placement) without refreshing bounds —
  // the bug the scene hit after fly-in.
  const positions = geometry.getAttribute('position') as BufferAttribute
  positions.setXYZ(0, 0, 0, 0)
  positions.setXYZ(1, 5, 0, 0)
  positions.setXYZ(2, -5, 0, 0)
  positions.needsUpdate = true

  return new Points(geometry)
}

describe('syncGeometryBounds', () => {
  it('recomputes a stale sphere so a side zoom still sees slice points', () => {
    const points = makeMorphedPoints()
    const staleCenter = points.geometry.boundingSphere!.center.clone()
    expect(staleCenter.z).toBeGreaterThan(50)

    const camera = new PerspectiveCamera(60, 1, 0.1, 20000)
    // Side view, zoomed in on the origin — the failure pose from orbit.
    camera.position.set(8, 0, 0)
    camera.up.set(0, 0, 1)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    )

    expect(frustum.intersectsObject(points)).toBe(false)

    syncGeometryBounds(points)

    expect(points.geometry.boundingSphere!.center.length()).toBeLessThan(5)
    expect(frustum.intersectsObject(points)).toBe(true)
  })
})

describe('sliceOrbitMinDistance', () => {
  it('stays above the near plane while allowing close inspection', () => {
    const min = sliceOrbitMinDistance(0.1, 60)
    expect(min).toBeGreaterThan(0.1)
    expect(min).toBeLessThan(60)
  })

  it('lowers the inspect floor so an Earth focus closer than 5% radius can stick', () => {
    // Sagittarius true-scale Earth sits ~1.66 from the orbit target after fit,
    // below the default inspect floor of 3. Without this, Earth POV animates in
    // and OrbitControls.update() clamps the camera back out.
    const base = sliceOrbitMinDistance(0.1, 60)
    expect(base).toBe(3)

    const earthFocus = 1.655
    const min = sliceOrbitMinDistance(0.1, 60, earthFocus)
    expect(min).toBeCloseTo(earthFocus, 5)
    expect(min).toBeLessThan(base)
  })

  it('never drops below near-plane clearance even when focus is closer', () => {
    const nearClearance = 0.1 * 10
    const min = sliceOrbitMinDistance(0.1, 60, 0.2)
    expect(min).toBe(nearClearance)
  })

  it('keeps the inspect floor when focus is farther out', () => {
    expect(sliceOrbitMinDistance(0.1, 60, 10)).toBe(3)
  })
})
