# Stoneslinger

A pixel-art survival side-scroller for mobile browsers. Defend your camp fire
from waves of critters attacking from both sides — starting with nothing but
rocks and working your way up the rock-throwing tech tree.

## How to play

- **◀ ▶** move (keyboard: `A`/`D`)
- **●** hold to throw — auto-aims at the nearest enemy in range (keyboard: `J`)
- **✦** gather from trees / rock piles / crystals, open the workbench at camp,
  or raise a defense when you're standing on a build pad (keyboard: `F`)
- **weapon rail** (bottom right) tap a weapon to equip it — locked ones show `---`
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

Both block ground enemies, so a barricade out at 270m and a turret behind it at
70m is worth more than two turrets side by side. Anything built can be repaired
(cost scales with the damage) or salvaged for half its materials back.

The point isn't surviving longer at the fire — it's that a turret holding a
flank is what lets you walk out to the crystal fields at the edges of the map
and still have a camp when you get home.

## Difficulty

Pick a mode on the title screen (remembered between sessions, with a separate
best score for each):

| Mode | Enemy HP & damage | Spawn rate & wave ramp | Loot drops |
| --- | --- | --- | --- |
| Easy | −30% | slower, smaller bursts | +35% |
| Medium | baseline | baseline | baseline |
| Hard | +35% HP / +30% dmg | faster, bigger bursts | −15% |

## Running it

It's a single self-contained `index.html` — no build, no dependencies.
Open it in any browser, or serve the folder and visit it from your phone:

```sh
cd stoneslinger
python3 -m http.server 8000
# then open http://<your-computer-ip>:8000 on your phone
```

Landscape orientation recommended. On iOS/Android you can "Add to Home Screen"
for a fullscreen app feel.

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
node test/smoke.js            # 49 checks, exits non-zero on failure
node test/smoke.js --headed   # watch it run
```

It needs [Playwright](https://playwright.dev) (`npm i -D playwright`, or a
global install — the test finds either). Run it before publishing a change.
