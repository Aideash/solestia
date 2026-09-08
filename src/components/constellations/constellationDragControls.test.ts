import { describe, expect, it } from 'vitest'
import {
  orbitRotateSpeed,
  overviewDragDelta,
  type ConstellationDragMode,
} from './constellationDragControls.ts'

const ROTATE_SPEED = 0.0045

describe('overview drag mapping', () => {
  it('moves the sky with the cursor in normal mode', () => {
    const right = overviewDragDelta({ movementX: 10, movementY: 0, mode: 'normal' })
    const down = overviewDragDelta({ movementX: 0, movementY: 10, mode: 'normal' })

    expect(right).toEqual({ yawDelta: 10 * ROTATE_SPEED, pitchDelta: 0 })
    expect(down).toEqual({ yawDelta: 0, pitchDelta: 10 * ROTATE_SPEED })
  })

  it('moves the sky against the cursor in inverted mode', () => {
    const right = overviewDragDelta({ movementX: 10, movementY: 0, mode: 'inverted' })
    const down = overviewDragDelta({ movementX: 0, movementY: 10, mode: 'inverted' })

    expect(right).toEqual({ yawDelta: -10 * ROTATE_SPEED, pitchDelta: 0 })
    expect(down).toEqual({ yawDelta: 0, pitchDelta: -10 * ROTATE_SPEED })
  })

  it('negates both axes when inverted relative to normal', () => {
    const modes: ConstellationDragMode[] = ['normal', 'inverted']
    const input = { movementX: -4, movementY: 7 }
    const [normal, inverted] = modes.map((mode) => overviewDragDelta({ ...input, mode }))

    expect(inverted.yawDelta).toBe(-normal.yawDelta)
    expect(inverted.pitchDelta).toBe(-normal.pitchDelta)
  })
})

describe('slice orbit rotate speed', () => {
  it('keeps grab-the-object speed in normal mode and negates it when inverted', () => {
    expect(orbitRotateSpeed('normal')).toBe(1)
    expect(orbitRotateSpeed('inverted')).toBe(-1)
  })
})
