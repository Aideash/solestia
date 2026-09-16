# Mercury date-time page

## Goal

Add `/orrery/mercury/time` with four **unified** civil systems. Mercury’s solar day outlasts its year (`solsPerYear ≈ 0.5`), so separate day/year pickers (Earth/Mars style) do not apply: one system selector drives both panes.

## Decisions

- Systems: `phases` (default), `ryzov`, `dual-24`, `dual-metric`
- Civil time is **mean** at the IAU prime meridian; **apparent** solar geometry stays on the center `PlanetClock` only
- No longitude/site picker in v1
- Specialized Mercury planet dial: out of scope (follow-up)
- Dual systems: Time = day clock, Date = year clock; user chooses which drives Live `epoch.cadence`

## Systems

### Phases (Aztec-named)

Year-locked packing (no leap-cycles):

- 1 mean (anomalistic) year = 3 phases = 90 cycles
- 1 civil mean solar day = 2 years = 6 phases = 180 cycles (3:2 identity by fiat)
- Cycle clock: **6-60-60** over one cycle

Phase names (short / full): Tezcat/Tezcatlipoca, Piltzin/Piltzintecuhtli, Huitzi/Huitzilopochtli, Xiuhte/Xiuhtecuhtli, Chanti/Chantico, Mictlan/Mictlantecuhtli.

Weekdays (short / full): Tona/Tonatiuh, Meztli/Meztli, Xolotl/Xolotl, Atlahua/Atlahua, Centeotl/Centeotl, Tlalte/Tlaltecuhtli.

Epoch: the mean perihelion nearest J2000 (mean anomaly 0) is Tezcatlipoca, cycle 1, Tonatiuh, mean midnight by fiat.

Calendar grid: 6 weekday columns × 30 cycles in the current phase. Month chevrons shift one phase; year chevrons shift one civil solar day (6 phases).

### Ryzov Mercurian

Creative calendar from NK_Ryzov (epoch **1974-03-29**):

- 8 dates/week (Primis…Octavus), 22 named weeks/cycle, 176 dates/cycle ≈ one solar day
- Date 176 leap hours: odd cycles 25h, even 26h, every 128th cycle no leap (24h); other dates 24 SI hours
- Clock: 24-60-60 over the current date’s length

### Dual 24 / dual metric

Two free-running analog clocks over mean solar day and mean year (24-60-60 or 10-100-100). No month grid. Cadence source toggle: day or year.

## UI

Mirror Mars studio: Time | PlanetClock | Date. Single **System** control. For dual layouts, Date pane hosts the year `AnalogClock` and a cadence toggle.

Live cadence binds `epoch.cadence` to the active clock’s `tickMs` / `frameMs`; restore `SI_SECOND_CADENCE` on leave.

## Implementation sketch

- `src/lib/mercuryTime.ts` — periods, phase/Ryzov math, mean fractions
- `src/lib/mercurySystems.ts` — bundles + `ClockDriver` / `CalendarDriver` adapters
- `src/views/MercuryTimePage.vue` — page shell
- `src/router.ts` + `src/data/timePages.ts` — route and discovery
- Regression checks for packing, Ryzov epoch/leaps, dual periods
