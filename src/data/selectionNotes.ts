import type { AsteroidId } from './asteroids.ts'
import type { SatelliteId } from './moons.ts'
import type { PlanetId, RotationFrameChoice } from './planets.ts'

/**
 * Short notes for the selected-body callout, limited to what is peculiar to
 * that body. Bodies with nothing peculiar stay omitted.
 *
 * Model accuracy belongs in the orbit table's help panel. Tidal locking is
 * mentioned only where it is unusual or absent.
 */
export const SELECTION_NOTES: Partial<Record<PlanetId | SatelliteId | AsteroidId, string[]>> = {
  mercury: [
    'Mercury is locked in a 3:2 spin–orbit resonance: two spins for every three orbits, so a solar day lasts longer than a year.',
    'The clocks use apparent solar time, not a mean Sun. Around perihelion the true Sun reverses in Mercury’s sky, and the day hand genuinely creeps backward for a few days.',
  ],
  venus: [
    'Venus rotates retrograde, so the Sun rises in the west.',
    'Retrograde spin makes the solar day shorter than the sidereal day: the Sun returns to the same meridian before the planet has finished one turn relative to the stars.',
  ],
  mars: [
    'Perihelion falls in southern summer, so southern seasons run shorter and hotter — the asymmetry behind the planet-encircling dust storms.',
    'The sol is 24h 37m and the tilt 25.2°, both close to Earth’s, but with no large moon to steady it the axis has wandered chaotically over millions of years.',
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
    'Double-click Saturn to open the system of its seven largest moons.',
  ],
  uranus: [
    'Uranus rotates retrograde. It has no separate cloud or magnetic W, so those pickers stay on the IAU cartographic meridian.',
    'The spin axis lies nearly in the ecliptic, so the facing whisker shortens to almost nothing twice per spin — the prime meridian is then pointing at an ecliptic pole.',
    'Double-click Uranus to open the system of its five major moons.',
  ],
  neptune: [
    'IAU 2015 W is Karkoschka’s ~15.97 h south-polar cloud period, the cartographic longitude since 2015. The cloud picker uses that same W.',
    'Magnetic is the Voyager radio period of ~16.11 h (Seidelmann et al. 2002), a distinct reference from the IAU meridian.',
    'Double-click Neptune to open the system of Proteus, Triton, and Nereid.',
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
  mimas: [
    'Cassini measured a forced spin libration of about 50 arcmin, twice the hydrostatic value. That extra wobble, and the periapsis drift it produces, point to a global ocean 20–30 km down — likely younger than 25 million years, still too new to have resurfaced the ice.',
    'A 2:1 inner Lindblad resonance with Mimas holds the outer edge of Saturn’s B ring and opens the Huygens gap at the inner rim of the Cassini Division; weaker Mimas resonances raise spiral density waves across the rings.',
    'A 4:2 inclination resonance with Tethys swings Mimas’s orbital longitude by about ±43° over 71 years. The IAU meridian carries that motion as a 44.85° term, not a spin wobble — a uniform month cannot follow it, so the facing here is only exact on average.',
    'Herschel crater is about 130 km wide, nearly a third of Mimas’s diameter; the impact that made it came close to breaking the moon apart.',
  ],
  enceladus: [
    'Jets erupt from fractures near the south pole, feeding Saturn’s E ring with ice from a global subsurface ocean.',
  ],
  tethys: [
    'Odysseus crater spans almost two fifths of the moon, while Ithaca Chasma runs most of the way around it.',
  ],
  dione: [
    'Bright ice cliffs cross its trailing hemisphere: fractures once mistaken for wispy surface deposits in distant Voyager images.',
  ],
  rhea: [
    'Saturn’s second-largest moon is an old, heavily cratered ice world with an extremely thin oxygen and carbon-dioxide exosphere.',
  ],
  titan: [
    'The only moon with a dense atmosphere and the only world besides Earth known to have stable surface lakes and seas, filled with methane and ethane.',
  ],
  iapetus: [
    'One hemisphere is about ten times darker than the other, and a ridge up to roughly 20 km high follows much of the equator.',
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
  proteus: [
    'Neptune’s largest inner moon is just over the size at which icy bodies become rounded by their own gravity; its irregular outline still carries the enormous crater Pharos.',
    'Proteus follows a nearly circular, nearly equatorial orbit and keeps the same face toward Neptune.',
  ],
  triton: [
    'Triton is the only large moon with a retrograde orbit. Its reversed motion and inclined path point to capture from the Kuiper belt.',
    'Despite that capture, tides have circularized the orbit and locked Triton’s rotation to its 5.88-day month.',
  ],
  nereid: [
    'Nereid’s eccentricity is about 0.75: its distance from Neptune changes by roughly a factor of seven between perineptune and aponeptune.',
    'It rotates in 11.594 hours instead of keeping one face toward Neptune. No standard pole or prime-meridian solution exists, so this clock assumes a prograde orbit-normal pole and an arbitrary J2000 phase.',
  ],
  hygiea: [
    'Hygiea rotates retrograde in 13.82559 hours. Its period and pole are measured, but no cartographic prime meridian has been defined, so the clock uses an arbitrary J2000 phase.',
  ],
  interamnia: [
    'Interamnia rotates in 8.71234 hours. Its period and pole are measured, but no cartographic prime meridian has been defined, so the clock uses an arbitrary J2000 phase.',
  ],
}

/**
 * What anchors each body's zero of longitude, for the callout footer. Keyed the
 * same way the frames are in `planets.ts`: `magnetic` and `cloud` are overrides
 * and anything missing falls back to `iau`.
 *
 * Sources are the IAU WGCCRE reports (Archinal et al.), Table 1 and Table 2
 * footnotes. On a synchronous moon 0° is the sub-planet meridian, and a named
 * crater only pins that system to the surface — it generally sits nowhere near
 * the meridian it fixes, Cilix anchoring Europa from 182° W, almost antipodal
 * to Jupiter. Nereid, which has no orientation model at all, says so.
 */
type MeridianLabel = { iau: string; magnetic?: string; cloud?: string }

export const PRIME_MERIDIANS: Record<PlanetId | SatelliteId | AsteroidId, MeridianLabel> = {
  mercury: { iau: 'PM: Hun Kal at 20° W' },
  venus: { iau: 'PM: Ariadne crater' },
  earth: { iau: 'PM: IERS reference meridian' },
  mars: { iau: 'PM: Viking 1 lander' },
  jupiter: { iau: 'PM: System III (magnetic)', cloud: 'PM: System I (clouds)' },
  saturn: { iau: 'PM: System III (magnetic)', cloud: 'PM: System I (clouds)' },
  uranus: { iau: 'PM: System III (magnetic)' },
  neptune: { iau: 'PM: Karkoschka’s cloud', magnetic: 'PM: System III (radio)' },
  moon: { iau: 'PM: Mean Earth direction' },
  io: { iau: 'PM: Jupiter facing' },
  europa: { iau: 'PM: Jupiter facing, Cilix at 182° W' },
  ganymede: { iau: 'PM: Jupiter facing, Anat at 128° W' },
  callisto: { iau: 'PM: Jupiter facing, Saga at 326° W' },
  mimas: { iau: 'PM: Saturn facing, Palomides at 162° W' },
  enceladus: { iau: 'PM: Saturn facing, Salih at 5° W' },
  tethys: { iau: 'PM: Saturn facing, Arete at 299° W' },
  dione: { iau: 'PM: Saturn facing, Palinurus at 63° W' },
  rhea: { iau: 'PM: Saturn facing, Tore at 340° W' },
  titan: { iau: 'PM: Saturn facing' },
  iapetus: { iau: 'PM: Saturn facing, Almeric at 276° W' },
  miranda: { iau: 'PM: Uranus facing' },
  ariel: { iau: 'PM: Uranus facing' },
  umbriel: { iau: 'PM: Uranus facing' },
  titania: { iau: 'PM: Uranus facing' },
  oberon: { iau: 'PM: Uranus facing' },
  proteus: { iau: 'PM: Neptune facing' },
  triton: { iau: 'PM: Neptune facing' },
  nereid: { iau: 'PM: None defined' },
  vesta: { iau: 'PM: Claudia crater' },
  ceres: { iau: 'PM: Kait crater' },
  pallas: { iau: 'PM: Long axis of shape model' },
  interamnia: { iau: 'PM: None defined' },
  'europa-52': { iau: 'PM: Long axis of shape model' },
  hygiea: { iau: 'PM: None defined' },
  davida: { iau: 'PM: Arbitrary light-curve phase' },
}

export function primeMeridianLabel(
  id: PlanetId | SatelliteId | AsteroidId,
  frame: RotationFrameChoice,
): string {
  const label = PRIME_MERIDIANS[id]
  const override =
    frame === 'magnetic' ? label.magnetic : frame === 'cloud' ? label.cloud : undefined
  return override ?? label.iau
}
