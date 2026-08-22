# Stoneslinger

A pixel-art survival side-scroller for mobile browsers. Defend your camp fire
from waves of critters attacking from both sides — starting with nothing but
rocks and working your way up the rock-throwing tech tree.

## How to play

- **◀ ▶** move (keyboard: `A`/`D`)
- **●** hold to throw — auto-aims at the nearest enemy in range (keyboard: `J`)
- **✦** gather from trees / rock piles / crystals, or open the workbench at camp (keyboard: `K`)
- **↻** swap between crafted weapons (keyboard: `Q`)

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
