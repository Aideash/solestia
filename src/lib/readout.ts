/** Shape of the data a system view hands to the shared readout table. */

export type ReadoutColumn = {
  id: string
  /** Plain-text heading. A `head-<id>` slot replaces it where markup is needed. */
  heading: string
  /** Wording used in the column picker. */
  label: string
  /** Hover text on the heading. */
  title?: string
  onByDefault: boolean
}

export type ReadoutCell = {
  primary: string
  /** Dimmer second line, usually the same value in another unit. */
  secondary?: string
  title?: string
}

export type ReadoutRow = {
  id: string
  name: string
  color?: string
  /** Muted text after the name, such as an asteroid's catalog number. */
  detail?: string
  cells: Record<string, ReadoutCell | undefined>
}

/** A row that leads somewhere else instead of describing a body. */
export type ReadoutNavigation = {
  id: string
  /** Body row this sits beneath. */
  afterId: string
  name: string
  detail: string
}
