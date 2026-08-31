import type { SatelliteId } from './moons.ts'
import type { PlanetId } from './planets.ts'

/**
 * Short notes for the selected-body callout, limited to what is peculiar to
 * that body. Bodies with nothing peculiar stay omitted.
 *
 * Two things deliberately stay out: model accuracy, which belongs in the orbit
 * table's help panel, and the tidal lock, which every moon here shares — a moon
 * earns a note only when the lock is imperfect, as Europa's may be.
 */
export const SELECTION_NOTES: Partial<Record<PlanetId | SatelliteId, string[]>> = {
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
  earth: [
    'Double-click Earth to open the Earth–Moon system.',
    'The Moon raises tides and stabilizes Earth’s axial tilt over geological timescales.',
    'The year rim starts at perihelion, not January 1 — Earth reaches it around January 3–4. The dial tracks the Earth–Moon barycenter, so the true closest approach can fall up to a day either side.',
  ],
  saturn: [
    'IAU and magnetic longitude are System III.',
    'Cloud is the equatorial System I period of 10h 14m. The IAU no longer tabulates that rate; it is kept here so the cloud picker still has an optical W.',
  ],
  uranus: [
    'Uranus rotates retrograde. It has no separate cloud or magnetic W, so those pickers stay on the IAU cartographic meridian.',
    'The spin axis lies nearly in the ecliptic, so the facing whisker shortens to almost nothing twice per spin — the prime meridian is then pointing at an ecliptic pole.',
    'Double-click Uranus to open the system of its five major moons.',
  ],
  neptune: [
    'IAU 2015 W is Karkoschka’s ~15.97 h south-polar cloud period, the cartographic longitude since 2015. The cloud picker uses that same W.',
    'Magnetic is the Voyager radio period of ~16.11 h (Seidelmann et al. 2002), a distinct reference from the IAU meridian.',
  ],
  io: [
    'The 4:2:1 Laplace resonance with Europa and Ganymede keeps pumping Io’s small eccentricity, and the tidal flexing that follows makes it the most volcanically active body in the solar system.',
    'Its apsides circulate in 1.33 years, the fastest turn of any moon here, and they regress: for the inner pair the resonance rather than Jupiter’s oblateness sets the pace.',
  ],
  europa: [
    'A salty ocean sits beneath tens of kilometers of ice, kept liquid by the same resonant flexing that drives Io’s volcanism.',
    'The lock may not be exact: the cycloidal cracks and shell models suggest the ice creeps over the interior, taking at least tens of thousands of years to lap it. The IAU rate used here is precisely synchronous.',
  ],
  ganymede: [
    'The largest moon in the solar system, wider than Mercury, and the only one generating its own magnetic field — it holds a small magnetosphere and polar aurorae inside Jupiter’s.',
    'Its apsides advance rather than regress, and slowly: 68 years against Io’s 1.33. Out here Jupiter’s oblateness, not the resonance, governs the ellipse.',
  ],
  callisto: [
    'The one Galilean outside the 4:2:1 chain, so nothing forces its eccentricity — little tidal heating, and one of the most heavily cratered surfaces known.',
    'At 1.9 million km the Sun’s pull begins to compete with Jupiter’s flattening, so its Laplace plane is tipped away from Io’s toward the ecliptic.',
  ],
  moon: [
    'Alone among the moons here, the orbit is referred to the ecliptic rather than a parent-linked plane: the 5.2° inclination is tilt from Earth’s orbit, and the node regresses once every 18.6 years — the cycle that walks eclipse seasons through the year.',
    'Libration is physical as well as optical: the IAU 2009 series adds genuine nodding to the ±2e swing, and between them about 59% of the surface comes into view over time.',
  ],
  miranda: [
    'Its 4.4° inclination is the largest in the system and a leftover of a past 3:1 resonance with Umbriel — the one Uranian moon that visibly leaves the equator plane in this view.',
    'That heating episode left a patchwork of coronae and ridges cut by Verona Rupes, a scarp several kilometers high and possibly as much as 20.',
  ],
  ariel: [
    'The brightest and youngest surface of the Uranian majors: rift floors resurfaced long after the cratering the others still carry.',
    'Its orbit lies in Uranus’s equator to within the fit, so the inclination reads zero and the node has no defined precession.',
  ],
  umbriel: [
    'The darkest of the Uranian majors, reflecting about half the light Ariel does from a surface that appears never to have been resurfaced. The bright ring of Wunda near its equator is the one exception.',
  ],
  titania: [
    'The largest Uranian moon and the most deeply rifted: Messina Chasma runs some 1,500 km, opened as a wet interior froze and expanded.',
    'Its apsides need about 580 years to circulate, the slowest here, so the ellipse barely turns across the 1800–2050 window.',
  ],
  oberon: [
    'Outermost of the five and heavily cratered, with dark deposits on many crater floors. Voyager 2 caught an ~11 km mountain in profile on its limb.',
  ],
}
