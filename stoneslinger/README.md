# Stoneslinger

A pixel-art survival side-scroller for the browser. Defend your camp fire from
waves of critters attacking from both sides — starting with nothing but rocks
and working your way up the rock-throwing tech tree. Built for a desktop
window; touch devices still get a thumb pad.

## How to play

- **◀ ▶** move (keyboard: `A`/`D`)
- **●** hold to throw — auto-aims at the nearest enemy in range (keyboard: `J`)
- **✦** gather from trees / rock piles / crystals, open the workbench at camp,
  or raise a defense when you're standing on a build pad (keyboard: `F`)
- **weapon rail** click or tap a weapon to equip it — locked ones show `---`
  until you build them (keyboard: `1`-`4`, or `Q` to cycle)

Loot you carry is stored automatically when you walk back to camp. Spend it at
the workbench to craft and research:

| Weapon | Character |
| --- | --- |
| Thrown Rock | The classic. It is a rock. |
| Slingshot | Faster, stronger rocks. |
| Rock Caster | Hurls boulders — slow and short-ranged until researched. |
| Auto-Slinger | Full-auto pebble storm (needs crystal). |

Each weapon researches up to level 7 (+damage, +fire rate, +range). You can
also repair the camp and sew a bigger bag. Waves get bigger and meaner forever;
when the fire goes out, it's over.

## Defenses

Six **build pads** sit along the lane, three either side of the fire at 70m,
170m and 270m. Stand on one and press ✦ to raise something:

| | Cost | What it does |
| --- | --- | --- |
| Barricade | 20 wood | 90 HP of lashed stakes. Ground foes stop and chew through it instead of walking past. Bats fly over. |
| Slinger Turret | 30 wood, 35 stone, 3 crystal | 60 HP. Fires on its own — DMG 3 at 0.9/sec, range 92. |
| Grove | 24 wood (needs the Seed Pouch) | 70 HP. Takes 24s to come up, then bears 5 wood on a 20s cycle. Harvest it with ✦ like any tree. |

Both block ground enemies, so a barricade out at 270m and a turret behind it at
70m is worth more than two turrets side by side. Anything built can be repaired
(cost scales with the damage) or salvaged for half its materials back.

A sapling is too small to bother anyone, so a grove is safe while it grows;
once it's up it blocks like a softer wall that keeps paying wood back.

Knock one down and the wreck stays on the pad. It does nothing — it won't stop
anyone — but the foundations count: **rebuilding costs half**. Clear the rubble
(free) if you'd rather put something different there.

The point isn't surviving longer at the fire — it's that a turret holding a
flank is what lets you walk out to the crystal fields at the edges of the map
and still have a camp when you get home.

## Camp tech

The workbench has two tabs. **WEAPONS** is the research tree; **CAMP** is
everything else. Each upgrade is costed in the materials it *doesn't* help you
collect, so no single gathering loop can be specialised into while the other
two go ignored.

| | Levels | What it does |
| --- | --- | --- |
| Bigger Bag | ∞ | +5 carried per trip. |
| Sharp Tools | 3 | Swing time 0.40s → 0.31 → 0.24 → 0.18. Less time stood still with your back to the lane. |
| Deep Cuts | 2 | +1 resource per swing per level. The same node goes further. |
| Seed Pouch | 1 | Unlocks the Grove. |

Travel is the real cost in this game — a crystal run is about 21 seconds of
walking for 4 seconds of swinging — so the bag, and groves you plant near the
fire, matter more than raw swing speed does.

## Difficulty

Pick a mode on the title screen (remembered between sessions, with a separate
best score for each):

A wave runs 52 seconds and sends the same head-count it always did — they just
arrive spread out rather than in a rush. All three cadence knobs (wave length,
the gap inside a burst, and the between-wave trickle) live together in `WAVE`.

Enemies also scale with the wave: +10% HP and +8% damage per wave past the
first, multiplied by the mode's ramp. Because waves now take twice as long,
a given wave number is roughly twice as far into the run as it used to be.

| Mode | Enemy HP & damage | Spawn rate & wave ramp | Loot drops |
| --- | --- | --- | --- |
| Easy | −30% | slower, smaller bursts | +35% |
| Medium | baseline | baseline | baseline |
| Hard | +35% HP / +30% dmg | faster, bigger bursts | −15% |

## Running it

It's a single self-contained `index.html` — no build, no dependencies.
Open it in any browser.

```sh
cd stoneslinger
python3 -m http.server 8000
```

The canvas is 560×270 internally and scales up in whole device-pixel steps, so
it stays crisp at any window size. On a desktop the on-screen thumb pad is
hidden and the weapon rail moves to the bottom centre — controls are:

| | |
| --- | --- |
| `A` / `D` or `←` `→` | move |
| `J` or `Space` | throw |
| `F` | gather / build |
| `1`–`4` or `Q` | swap weapon |
| `Esc` | close panel |

Touch devices still get the thumb pad and the tap-to-equip rail; landscape is
recommended there.

## Developing

`index.html` is the whole game. Rough layout of the script:

| Section | What's in it |
| --- | --- |
| setup | canvas sizing, audio, sprite helpers |
| weapons / difficulty | `WDEF`, `DIFFS`, stat scaling |
| state | `initGame()`, input binding, the weapon rail |
| defenses | `PADS`, `BDEF`, blocking and repair helpers |
| sim | `update()` — player, gathering, spawner, enemies, defenses, projectiles |
| render | `render()`, `drawBase()`, `drawHUD()` |
| sprite bank | pixel data for every sprite, parked at the bottom |

The sprite bank sits below the game loop on purpose: it's ~120 lines of pure
data you never edit while working on gameplay. Nothing reads it until the first
frame, which runs after the script has finished evaluating.

### Tests

`test/smoke.js` drives the real page in headless Chromium and checks the title
screen, difficulty selection, the weapon rail, gathering, banking loot, combat,
base defenses (building, blocking, turret kills, repair, salvage) and the
game-over/retry path — plus that the run produced no JavaScript errors.
Where it can it steps the simulation by calling `update(dt)` directly rather
than sleeping, so it's fast and doesn't flake.

```sh
cd stoneslinger
node test/smoke.js            # 93 checks, exits non-zero on failure
node test/smoke.js --headed   # watch it run
```

It needs [Playwright](https://playwright.dev) (`npm i -D playwright`, or a
global install — the test finds either). Run it before publishing a change.
