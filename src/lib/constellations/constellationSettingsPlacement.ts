export type SettingsPopupPlacement = {
  top: number
  left: number
  width: number
  maxHeight: number
}

export type SettingsPopupPlacementInput = {
  trigger: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>
  viewportWidth: number
  viewportHeight: number
  margin: number
  gap: number
  preferredWidth: number
}

/**
 * Places the settings dialog in the viewport relative to its trigger.
 * Prefers the side with more room (below vs above), clamps horizontally,
 * and returns a maxHeight so callers can scroll when content cannot fit.
 */
export function placeSettingsPopup({
  trigger,
  viewportWidth,
  viewportHeight,
  margin,
  gap,
  preferredWidth,
}: SettingsPopupPlacementInput): SettingsPopupPlacement {
  const width = Math.min(preferredWidth, Math.max(0, viewportWidth - margin * 2))
  let left = trigger.right - width
  left = Math.min(left, viewportWidth - margin - width)
  left = Math.max(margin, left)

  const spaceBelow = viewportHeight - margin - (trigger.bottom + gap)
  const spaceAbove = trigger.top - gap - margin

  if (spaceBelow >= spaceAbove) {
    return {
      top: trigger.bottom + gap,
      left,
      width,
      maxHeight: Math.max(0, spaceBelow),
    }
  }

  return {
    top: margin,
    left,
    width,
    maxHeight: Math.max(0, spaceAbove),
  }
}
