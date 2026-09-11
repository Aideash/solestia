import { describe, expect, it } from 'vitest'
import {
  DESELECT_REORIENT_END,
  deselectMorphAmount,
  deselectOpacityAmount,
  deselectPhaseWeights,
  earthPovCameraOffset,
  easeInOutCubic,
  frontFacingCameraOffset,
  yawPitchFromDirection,
} from '../../../lib/constellations/constellationSceneTransition.ts'

describe('yawPitchFromDirection', () => {
  it('maps +X to yaw 0 and pitch 0', () => {
    expect(yawPitchFromDirection({ x: 1, y: 0, z: 0 })).toEqual({ yaw: 0, pitch: 0 })
  })

  it('maps +Y to yaw π/2 and pitch 0', () => {
    const { yaw, pitch } = yawPitchFromDirection({ x: 0, y: 1, z: 0 })
    expect(yaw).toBeCloseTo(Math.PI / 2, 6)
    expect(pitch).toBeCloseTo(0, 6)
  })

  it('maps a tilted unit direction to matching pitch', () => {
    const pitch = 0.4
    const yaw = -0.7
    const cosPitch = Math.cos(pitch)
    const direction = {
      x: cosPitch * Math.cos(yaw),
      y: cosPitch * Math.sin(yaw),
      z: Math.sin(pitch),
    }
    const result = yawPitchFromDirection(direction)
    expect(result.yaw).toBeCloseTo(yaw, 6)
    expect(result.pitch).toBeCloseTo(pitch, 6)
  })
})

describe('frontFacingCameraOffset', () => {
  it('places the camera on -depth at the given distance', () => {
    const offset = frontFacingCameraOffset({ x: 0, y: 0, z: 1 }, 100)
    expect(offset.x).toBeCloseTo(0, 6)
    expect(offset.y).toBeCloseTo(0, 6)
    expect(offset.z).toBeCloseTo(-100, 6)
  })

  it('falls back to a positive distance when the input is non-finite or non-positive', () => {
    const offset = frontFacingCameraOffset({ x: 1, y: 0, z: 0 }, Number.NaN, 50)
    expect(offset.x).toBeCloseTo(-50, 6)
    expect(offset.y).toBeCloseTo(0, 6)
    expect(offset.z).toBeCloseTo(0, 6)
  })
})

describe('earthPovCameraOffset', () => {
  const depth = { x: 0, y: 0, z: 1 }
  const earthWorld = { x: 10, y: -4, z: -80 }

  it('uses the geometric Earth offset in true scale', () => {
    const offset = earthPovCameraOffset({
      depthMode: 'true',
      earthWorld,
      depth,
      currentDistance: 144,
      fallbackDistance: 144,
    })
    expect(offset.x).toBeCloseTo(10, 6)
    expect(offset.y).toBeCloseTo(-4, 6)
    expect(offset.z).toBeCloseTo(-80, 6)
  })

  it('keeps the current orbit distance in compressed depth instead of chasing Earth', () => {
    const offset = earthPovCameraOffset({
      depthMode: 'compressed',
      earthWorld,
      depth,
      currentDistance: 120,
      fallbackDistance: 144,
    })
    expect(offset.x).toBeCloseTo(0, 6)
    expect(offset.y).toBeCloseTo(0, 6)
    expect(offset.z).toBeCloseTo(-120, 6)
  })

  it('falls back to a front-facing pose when true-scale Earth coincides with the origin', () => {
    const offset = earthPovCameraOffset({
      depthMode: 'true',
      earthWorld: { x: 0, y: 0, z: 0 },
      depth,
      currentDistance: 90,
      fallbackDistance: 144,
    })
    expect(offset.z).toBeCloseTo(-90, 6)
  })

  it('diverges from -depth at |earth| when the figure centroid is off-axis', () => {
    // Reorient used to call frontFacingCameraOffset, which pans away from the
    // Earth POV button's true-scale stand whenever Earth is not on pure -depth.
    const distance = Math.hypot(earthWorld.x, earthWorld.y, earthWorld.z)
    const front = frontFacingCameraOffset(depth, distance)
    const earth = earthPovCameraOffset({
      depthMode: 'true',
      earthWorld,
      depth,
      currentDistance: distance,
      fallbackDistance: 144,
    })
    expect(Math.hypot(earth.x - front.x, earth.y - front.y, earth.z - front.z)).toBeGreaterThan(1)
    expect(earth).toEqual(earthWorld)
  })
})

describe('deselect phase weights', () => {
  it('stays in reorient through the first segment', () => {
    const early = deselectPhaseWeights(0)
    expect(early.reorient).toBe(0)
    expect(early.zoomMorph).toBe(0)

    const midReorient = deselectPhaseWeights(DESELECT_REORIENT_END * 0.5)
    expect(midReorient.reorient).toBeGreaterThan(0)
    expect(midReorient.reorient).toBeLessThan(1)
    expect(midReorient.zoomMorph).toBe(0)

    const atBoundary = deselectPhaseWeights(DESELECT_REORIENT_END)
    expect(atBoundary.reorient).toBe(1)
    expect(atBoundary.zoomMorph).toBe(0)
  })

  it('runs zoom/morph only after reorient completes', () => {
    const midZoom = deselectPhaseWeights((DESELECT_REORIENT_END + 1) / 2)
    expect(midZoom.reorient).toBe(1)
    expect(midZoom.zoomMorph).toBeGreaterThan(0)
    expect(midZoom.zoomMorph).toBeLessThan(1)

    const done = deselectPhaseWeights(1)
    expect(done.reorient).toBe(1)
    expect(done.zoomMorph).toBe(1)
  })

  it('keeps morph at slice during reorient, then returns to the sphere', () => {
    expect(deselectMorphAmount(0)).toBe(1)
    expect(deselectMorphAmount(DESELECT_REORIENT_END)).toBe(1)
    expect(deselectMorphAmount(1)).toBe(0)

    const mid = deselectMorphAmount((DESELECT_REORIENT_END + 1) / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('keeps overview dim during reorient, then restores opacity', () => {
    expect(deselectOpacityAmount(0)).toBe(0)
    expect(deselectOpacityAmount(DESELECT_REORIENT_END)).toBe(0)
    expect(deselectOpacityAmount(1)).toBe(1)
  })
})

describe('easeInOutCubic', () => {
  it('is identity at the endpoints and softer in the middle', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBe(0.5)
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25)
  })
})
