/**
 * Near-side lunar features, from the IAU Gazetteer of Planetary Nomenclature.
 * Centers are the gazetteer's planetographic +east coordinates; the semi-axes
 * are half of its latitude and longitude bounding box, with the longitude half
 * multiplied by the cosine of the center latitude to turn degrees of longitude
 * into degrees of arc.
 * https://planetarynames.wr.usgs.gov/
 *
 * So each mare here is the ellipse that brackets it, not its basalt boundary.
 * The bounding box is worth the extra two numbers over the tabulated diameter
 * because it keeps the shapes the near-side pattern is read by: the round
 * basins come out the same either way (Imbrium 19° by 18°, against a 19°
 * circle) while Procellarum is 25° by 37°, not the 43° circle its diameter
 * alone would give. Mare Frigoris is the one the box still flatters — it is a
 * thin arc along Imbrium's north shore, and a box drawn around a curve is
 * about twice as wide as the arc, so it reads broader here than it should.
 *
 * Small maria and every far-side mare are left out: at this size they would
 * land inside a pixel or two, and the point is the pattern, not the atlas.
 */

import type { SurfaceCap } from '../lib/globe.ts'

/** Dark basalt plains, largest first. */
export const MOON_MARIA: readonly SurfaceCap[] = [
  { name: 'Oceanus Procellarum', lon: -56.68, lat: 20.67, semiEastDeg: 25.4, semiNorthDeg: 36.9 },
  { name: 'Mare Imbrium', lon: -14.91, lat: 34.72, semiEastDeg: 19.3, semiNorthDeg: 18.1 },
  { name: 'Mare Frigoris', lon: -0.01, lat: 57.59, semiEastDeg: 21.8, semiNorthDeg: 7.7 },
  { name: 'Mare Tranquillitatis', lon: 30.83, lat: 8.35, semiEastDeg: 14.1, semiNorthDeg: 11.7 },
  { name: 'Mare Fecunditatis', lon: 53.67, lat: -7.83, semiEastDeg: 11.2, semiNorthDeg: 13.9 },
  { name: 'Mare Nubium', lon: -17.29, lat: -20.59, semiEastDeg: 11.2, semiNorthDeg: 9.3 },
  { name: 'Mare Serenitatis', lon: 18.36, lat: 27.29, semiEastDeg: 10.4, semiNorthDeg: 10.8 },
  { name: 'Mare Crisium', lon: 59.1, lat: 16.18, semiEastDeg: 9.1, semiNorthDeg: 7.4 },
  { name: 'Mare Humorum', lon: -38.57, lat: -24.48, semiEastDeg: 6.9, semiNorthDeg: 6.3 },
  { name: 'Mare Nectaris', lon: 34.6, lat: -15.19, semiEastDeg: 5.3, semiNorthDeg: 5.6 },
  { name: 'Mare Vaporum', lon: 4.09, lat: 13.2, semiEastDeg: 4.5, semiNorthDeg: 3.8 },
]

/**
 * The three craters bright enough to read as spots on a full Moon. Centers are
 * the gazetteer's; the radii are not, because these craters are far smaller
 * than the marks they make. Tycho's rim is 1.4° of arc and Kepler's is 0.5°,
 * which is under a pixel on the disc, so each radius here is the bright ray
 * halo the crater throws instead — eyeballed against a full-Moon photograph,
 * the one number on this page with no source behind it.
 */
export const MOON_RAY_CRATERS: readonly SurfaceCap[] = [
  { name: 'Tycho', lon: -11.22, lat: -43.3, semiEastDeg: 6, semiNorthDeg: 6 },
  { name: 'Copernicus', lon: -20.08, lat: 9.62, semiEastDeg: 4, semiNorthDeg: 4 },
  { name: 'Kepler', lon: -38.01, lat: 8.12, semiEastDeg: 2.8, semiNorthDeg: 2.8 },
]
