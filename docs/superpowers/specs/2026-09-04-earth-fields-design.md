# Earth fields page (v1)

Earth-only page at `/earth/fields` (`earth-fields`). Shared canvas orthographic camera (no WebGL). Mode toggle: gravity (Earth–Moon osculating synodic CR3BP + Lagrange points) vs magnetism (tilted dipole + textbook magnetosphere). Smooth zoom retarget on mode change; instant if `prefers-reduced-motion`.

HUD: live pointer sample plus click-to-pin (suvagoo coordinate-readout behavior, Solestia styling). Field strength is `|∇U_eff|` (gravity) or `|B|` (magnetism). Time dilation is gravitational redshift vs infinity from Newtonian `Φ_grav` only (no centrifugal term), quoted as nanoseconds per day.

Reusable math lives in `src/lib/cr3bp.ts`, `src/lib/magnetosphere.ts`, and `src/lib/redshift.ts`. The Vue page is Earth-specific. Tests: `scripts/check-fields.ts`.

The magnetic field is a centered tilted dipole plus a Harris current sheet that stretches the outer field into tail lobes. Daily NASA OMNI dynamic pressure scales the Shue magnetopause nose and the Harris lobe strength (Bz is omitted). The sheet is a shape rather than a solved model: it stays under 1% of the field inside 3 Earth radii at quiet mean and only takes over near the magnetopause, which is what lets polar-cap lines open into the tail while the inner shells stay dipolar.

Out of scope: geoid/J2, IGRF, Tsyganenko, Sun–Earth Lagrange, generic planet routes, solar-wind slider, IMF clock angle, kinematic dilation.
