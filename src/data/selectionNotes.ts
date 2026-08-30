import type { MoonId } from './moons.ts'
import type { PlanetId } from './planets.ts'

/** Short caveats for the selected-body callout. Bodies with nothing peculiar stay omitted. */
export const SELECTION_NOTES: Partial<Record<PlanetId | MoonId, string[]>> = {
  mercury: [
    'Mercury is locked in a 3:2 spin–orbit resonance: two spins for every three orbits, so a solar day lasts longer than a year.',
    'The clocks use apparent solar time, not a mean Sun. Around perihelion the true Sun reverses in Mercury’s sky, and the day hand genuinely creeps backward for a few days.',
  ],
  venus: [
    'Venus rotates retrograde, so the Sun rises in the west.',
    'Retrograde spin makes the solar day shorter than the sidereal day: the Sun returns to the same meridian before the planet has finished one turn relative to the stars.',
  ],
  jupiter: [
    'IAU longitude is System III, the magnetic/radio frame; the magnetic picker is the same W.',
    'Cloud uses System I, the equatorial atmospheric period. Jupiter System II is stored in the table but is not a selectable longitude.',
    'Double-click Jupiter to open the Galilean system.',
  ],
  saturn: [
    'IAU and magnetic longitude are System III.',
    'Cloud is the equatorial System I period of 10h 14m. The IAU no longer tabulates that rate; it is kept here so the cloud picker still has an optical W.',
  ],
  uranus: [
    'Uranus rotates retrograde. It has no separate cloud or magnetic W, so those pickers stay on the IAU cartographic meridian.',
    'The spin axis lies nearly in the ecliptic, so the facing whisker shortens to almost nothing twice per spin — the prime meridian is then pointing at an ecliptic pole.',
  ],
  neptune: [
    'IAU 2015 W is Karkoschka’s ~15.97 h south-polar cloud period, the cartographic longitude since 2015. The cloud picker uses that same W.',
    'Magnetic is the Voyager radio period of ~16.11 h (Seidelmann et al. 2002), a distinct reference from the IAU meridian.',
  ],
  io: [
    'Io is tidally locked: the IAU prime meridian faces Jupiter, so the facing whisker points inward.',
    'Positions are JPL mean elements, not a full ephemeris. Independent Kepler ellipses slowly drift from the Laplace 4:2:1 resonance with Europa and Ganymede.',
  ],
  europa: [
    'Europa is tidally locked: the IAU prime meridian faces Jupiter, so the facing whisker points inward.',
    'Positions are JPL mean elements, not a full ephemeris. Independent Kepler ellipses slowly drift from the Laplace 4:2:1 resonance with Io and Ganymede.',
  ],
  ganymede: [
    'Ganymede is tidally locked: the IAU prime meridian faces Jupiter, so the facing whisker points inward.',
    'Positions are JPL mean elements, not a full ephemeris. Independent Kepler ellipses slowly drift from the Laplace 4:2:1 resonance with Io and Europa.',
  ],
  callisto: [
    'Callisto is tidally locked: the IAU prime meridian faces Jupiter, so the facing whisker points inward.',
    'Positions are JPL mean elements at J2000 plus periapsis and node precession. They are not a numerical ephemeris.',
  ],
}
