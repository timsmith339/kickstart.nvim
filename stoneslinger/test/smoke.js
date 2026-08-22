#!/usr/bin/env node
/* Stoneslinger smoke test.
 *
 *   node test/smoke.js            headless (default)
 *   node test/smoke.js --headed   watch it run
 *
 * Drives the real page in Chromium and asserts the game's states, the weapon
 * rail, gathering, combat and the game-over/retry path all still work. Where
 * it can, it steps the simulation by calling update(dt) directly instead of
 * sleeping, so runs are fast and don't flake on timing.
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');

const PAGE = 'file://' + path.join(__dirname, '..', 'index.html');
const HEADED = process.argv.includes('--headed');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); }
  catch (e) {}
  console.error('playwright not found. Install it with:  npm i -D playwright');
  process.exit(2);
}

let passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failures.push(name + (detail === undefined ? '' : '  <- ' + JSON.stringify(detail)));
         console.log('  FAIL ' + name + (detail === undefined ? '' : '  <- ' + JSON.stringify(detail))); }
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}
function section(t) { console.log('\n' + t); }

/* Run the sim by hand. panelOpen parks the rAF loop so only our frames land. */
function stepInPage(frames) {
  const was = panelOpen; panelOpen = true;
  for (let i = 0; i < frames; i++) update(1 / 60);
  // update() itself can open the workbench; don't stomp that when restoring
  panelOpen = document.getElementById('panel').classList.contains('hidden') ? was : true;
}

/* What the four rail buttons currently read, plus their classes. */
function railInPage() {
  return [...document.querySelectorAll('.wbtn')]
    .map(b => b.textContent.trim().replace(/\s+/g, '') + '|' + b.className);
}

function shownInPage(sel) {
  const el = document.querySelector(sel);
  return getComputedStyle(el).display !== 'none' && !el.classList.contains('hidden');
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));
  page.on('console', m => {
    // the Google Fonts fetch fails offline; that's the environment, not the game
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) jsErrors.push(m.text());
  });

  await page.goto(PAGE);
  await page.waitForFunction('typeof update === "function"');

  const step = n => page.evaluate(stepInPage, n);
  const rail = () => page.evaluate(railInPage);
  const shown = sel => page.evaluate(shownInPage, sel);
  const tapRail = id => page.click(`.wbtn[data-w="${id}"]`);

  section('boot');
  check('desktop layout on a fine pointer', await page.evaluate(
    'document.body.classList.contains("desktop")'));
  check('canvas scales to whole device pixels', await page.evaluate(
    '(parseFloat(cv.style.width)/IW) % 0.5 === 0'));
  check('title overlay is up', await shown('#titleO'));
  check('weapon rail hidden on title', !(await shown('#wsel')));
  eq('four weapon buttons exist', await page.evaluate('document.querySelectorAll(".wbtn").length'), 4);

  section('difficulty');
  eq('three difficulty buttons', await page.evaluate('document.querySelectorAll("#titleO .dbtn").length'), 3);
  await page.click('#titleO .dbtn[data-d="hard"]');
  eq('picking HARD selects it', await page.evaluate('curDiff'), 'hard');
  eq('HARD persists', await page.evaluate('localStorage.getItem("stoneslinger_diff")'), 'hard');
  check('HARD is harder than EASY', await page.evaluate(
    'DIFFS.hard.hp > DIFFS.easy.hp && DIFFS.hard.spawnIv < DIFFS.easy.spawnIv'));
  await page.click('#titleO .dbtn[data-d="medium"]');
  eq('back to MEDIUM', await page.evaluate('curDiff'), 'medium');

  section('starting a run');
  await page.evaluate('startRun()');
  eq('state is play', await page.evaluate('state'), 'play');
  check('rail visible in play', await shown('#wsel'));
  eq('only the rock is unlocked', await page.evaluate('G.levels'),
     { rock: 1, sling: 0, caster: 0, auto: 0 });
  eq('rail reflects that', await rail(), [
    'ROCKLV1|wbtn sel', 'SLING---|wbtn lock', 'CAST---|wbtn lock', 'AUTO---|wbtn lock']);

  section('weapon rail');
  await tapRail('auto');
  eq('tapping a locked weapon is refused', await page.evaluate('G.cur'), 'rock');
  check('and says why', await page.evaluate('G.floaters.some(f => f.txt === "NOT BUILT")'));

  await page.evaluate('G.stored = {wood:999, stone:999, crystal:999};' +
                      '["sling","caster","auto"].forEach(id => doBuy("craft:" + id));' +
                      'doBuy("up:sling"); doBuy("up:sling");');
  eq('crafting + research shows levels', await rail(), [
    'ROCKLV1|wbtn', 'SLINGLV3|wbtn', 'CASTLV1|wbtn', 'AUTOLV1|wbtn sel']);

  for (const id of ['rock', 'sling', 'caster', 'auto']) {
    await tapRail(id);
    eq('tap equips ' + id, await page.evaluate('G.cur'), id);
  }
  eq('exactly one button highlighted', await page.evaluate('document.querySelectorAll(".wbtn.sel").length'), 1);

  await page.keyboard.press('2');
  eq('key 2 equips the slingshot', await page.evaluate('G.cur'), 'sling');
  await page.keyboard.press('q');
  eq('q cycles onward', await page.evaluate('G.cur'), 'caster');

  section('workbench tabs');
  await page.evaluate('openPanel(null)');
  eq('two tabs', await page.evaluate('document.querySelectorAll("#pTabs .tab").length'), 2);
  check('weapons showing first',
        await page.evaluate('!!document.querySelector(\'[data-act^="up:"], [data-act^="craft:"]\')'));
  await page.click('#pTabs .tab[data-tab="camp"]');
  check('camp tab has the harvest tech',
        await page.evaluate('!!document.querySelector(\'[data-act="tech:tools"]\')'));
  check('and no weapon rows',
        await page.evaluate('!document.querySelector(\'[data-act^="up:"]\')'));
  await page.click('#pTabs .tab[data-tab="weapons"]');
  check('and back again',
        await page.evaluate('!!document.querySelector(\'[data-act^="up:"]\')'));
  await page.evaluate('closePanel()');

  section('harvest tech');
  eq('a bare swing is 0.40s', await page.evaluate('harvTime()'), 0.4);
  eq('and yields one', await page.evaluate('harvYield()'), 1);
  await page.evaluate('G.stored = {wood:999, stone:999, crystal:999};' +
                      'doBuy("tech:tools"); doBuy("tech:yield");');
  check('sharp tools speed it up', await page.evaluate('harvTime()') < 0.4);
  eq('deep cuts add to the take', await page.evaluate('harvYield()'), 2);
  await page.evaluate(() => {
    G.carried = { wood: 0, stone: 0, crystal: 0 };
    const n = G.nodes.find(n => n.type === 'rock');
    n.amount = n.max; G.player.x = n.x; G.player.hp = G.player.maxhp = 999;
    G.enemies = []; input.action = 1;
  });
  await step(30);   // half a second: at least one swing at 0.31s
  await page.evaluate('input.action = 0');
  check('a single swing now banks two', await page.evaluate('G.carried.stone >= 2'),
        await page.evaluate('G.carried'));
  await page.evaluate('G.tech = {tools:0, yield:0, seeds:0}');

  section('gathering and the base');
  await page.evaluate(() => {
    G.stored = { wood: 0, stone: 0, crystal: 0 };
    G.carried = { wood: 0, stone: 0, crystal: 0 };
    const n = G.nodes.find(n => n.type === 'tree');
    n.amount = n.max; G.player.x = n.x; input.action = 1;
  });
  await step(60);
  check('holding gather fills the bag', await page.evaluate('G.carried.wood > 0'),
        await page.evaluate('G.carried'));
  await page.evaluate('input.action = 0; G.player.x = BASE_X;');
  await step(5);
  check('walking home banks it', await page.evaluate('G.stored.wood > 0 && G.carried.wood === 0'),
        await page.evaluate('({stored: G.stored, carried: G.carried})'));

  section('combat');
  await page.evaluate(() => {
    selectWeapon('sling');
    G.kills = 0; G.enemies = []; G.projs = [];
    G.player.x = BASE_X; G.player.face = 1; G.player.hp = G.player.maxhp = 999;
    for (let i = 0; i < 6; i++) spawnEnemy();
    // line them up just downrange so the test doesn't depend on where they spawned
    G.enemies.forEach((e, i) => { e.x = BASE_X + 40 + i * 10; e.y = GROUND - 9; });
    input.attack = 1;
  });
  await step(300);
  await page.evaluate('input.attack = 0');
  check('the slingshot kills things', await page.evaluate('G.kills > 0'),
        await page.evaluate('({kills: G.kills, enemies: G.enemies.length})'));

  section('base defenses');
  eq('six build pads', await page.evaluate('G.pads.length'), 6);
  eq('all empty to start', await page.evaluate('G.pads.filter(p => p.b).length'), 0);

  // walk onto a pad and press the action button — same key as the workbench
  await page.evaluate(() => {
    closePanel();
    G.stored = { wood: 999, stone: 999, crystal: 999 };
    G.player.x = G.pads[3].x;
    input.action = 1;
  });
  await step(2);
  await page.evaluate('input.action = 0');
  check('a pad opens the build panel', await shown('#panel'));
  eq('titled as a build site', await page.evaluate('document.getElementById("pTitle").textContent.trim()'),
     '▣ BUILD SITE');

  const woodBefore = await page.evaluate('G.stored.wood');
  await page.click('#pRows .buy[data-act="build:wall"]');   // the real button, not doBuy()
  eq('barricade goes up on that pad', await page.evaluate('G.pads[3].b && G.pads[3].b.type'), 'wall');
  eq('and it costs wood', await page.evaluate('G.stored.wood'), woodBefore - 20);
  eq('the other pads are untouched', await page.evaluate('G.pads.filter(p => p.b).length'), 1);

  // a grub outside the wall should stop at it, not stroll past to the fire
  await page.evaluate(() => {
    closePanel();
    G.enemies = []; G.projs = []; G.waveT = 999; G.trickleT = 999; G.burst = 0;
    G.base.hp = G.base.maxhp; G.player.x = BASE_X; input.attack = 0;
    spawnEnemy();
    const e = G.enemies[0];
    e.type = 'grub'; e.x = 1100; e.y = GROUND; e.hp = e.maxhp = 999;
  });
  await step(300);
  check('a wall stops ground foes', await page.evaluate('G.enemies[0].x > G.pads[3].x'),
        await page.evaluate('({enemy: Math.round(G.enemies[0].x), wall: G.pads[3].x})'));
  check('they chew on it instead', await page.evaluate('G.pads[3].b.hp < G.pads[3].b.maxhp'),
        await page.evaluate('G.pads[3].b.hp'));
  eq('so the fire takes nothing', await page.evaluate('G.base.hp'), await page.evaluate('G.base.maxhp'));

  section('turrets');
  await page.evaluate(() => {
    openPanel(G.pads[2]);
    doBuy('build:turret');
    closePanel();
    G.enemies = []; G.projs = []; G.kills = 0;
    G.waveT = 999; G.trickleT = 999; G.burst = 0;
    G.player.x = BASE_X; input.attack = 0; input.left = input.right = 0;
    spawnEnemy();
    const e = G.enemies[0];
    e.type = 'grub'; e.x = G.pads[2].x - 40; e.y = GROUND;
  });
  eq('turret goes up', await page.evaluate('G.pads[2].b.type'), 'turret');
  await step(600);
  check('it kills on its own with the player idle', await page.evaluate('G.kills > 0'),
        await page.evaluate('({kills: G.kills, left: G.enemies.length})'));

  section('repair and salvage');
  await page.evaluate('openPanel(G.pads[3]); G.pads[3].b.hp = G.pads[3].b.maxhp / 2;' +
                      'G.stored = {wood:999, stone:999, crystal:999};');
  const beforeFix = await page.evaluate('G.stored.wood');
  await page.evaluate('doBuy("fix")');
  eq('repair restores full HP', await page.evaluate('G.pads[3].b.hp'), await page.evaluate('G.pads[3].b.maxhp'));
  check('and charges for it', await page.evaluate('G.stored.wood') < beforeFix);

  const beforeScrap = await page.evaluate('G.stored.wood');
  await page.evaluate('doBuy("scrap")');
  eq('salvage clears the pad', await page.evaluate('G.pads[3].b'), null);
  eq('and refunds half', await page.evaluate('G.stored.wood'), beforeScrap + 10);
  await page.evaluate('closePanel()');

  section('wreckage and rebuilding');
  await page.evaluate('G.stored = {wood:999, stone:999, crystal:999};' +
                      'openPanel(G.pads[2]); doBuy("build:turret"); closePanel();');
  eq('a turret to knock down', await page.evaluate('G.pads[2].b.type'), 'turret');
  await page.evaluate('hurtBuild(G.pads[2], 999)');
  eq('destroying it clears the building', await page.evaluate('G.pads[2].b'), null);
  eq('but leaves its wreck behind', await page.evaluate('G.pads[2].rub'), 'turret');
  eq('wreckage does not block enemies',
     await page.evaluate('blockerFor(G.pads[2].x - 60, BASE_X)'), null);

  await page.evaluate('openPanel(G.pads[2])');
  check('the pad offers a rebuild',
        await page.evaluate('!!document.querySelector(\'#pRows .buy[data-act="rebuild"]\')'));
  check('and no plain build while the wreck stands',
        await page.evaluate('!document.querySelector(\'#pRows .buy[data-act^="build:"]\')'));
  eq('rebuilding costs half', await page.evaluate('rebuildCost("turret")'),
     { wood: 15, stone: 18, crystal: 2 });
  const beforeRe = await page.evaluate('G.stored.stone');
  await page.evaluate('document.querySelector(\'#pRows .buy[data-act="rebuild"]\').' +
                      'dispatchEvent(new PointerEvent("pointerdown", {bubbles:true}))');
  eq('rebuild puts it back at full HP', await page.evaluate('G.pads[2].b.hp'),
     await page.evaluate('BDEF.turret.hp'));
  eq('and clears the wreck', await page.evaluate('G.pads[2].rub'), null);
  eq('at half price', await page.evaluate('G.stored.stone'), beforeRe - 18);

  await page.evaluate('hurtBuild(G.pads[2], 999); openPanel(G.pads[2]); doBuy("clear")');
  eq('clearing hauls the wreck off', await page.evaluate('G.pads[2].rub'), null);
  await page.evaluate('renderPanel()');
  check('which frees the pad for anything',
        await page.evaluate('!!document.querySelector(\'#pRows .buy[data-act="build:wall"]\')'));
  await page.evaluate('closePanel()');

  section('enemy scaling');
  /* spawnEnemy picks a type at random; pin Math.random so every sample is a grub
     and the numbers below compare like with like. */
  const hpAt = w => page.evaluate(
    'curDiff="medium"; G.wave=' + w + '; G.enemies.length=0;' +
    'const _r=Math.random; Math.random=()=>0.9; spawnEnemy(); Math.random=_r;' +
    'G.enemies[0].maxhp');
  const w1 = await hpAt(1), w11 = await hpAt(11);
  check('wave 11 enemies are tougher than wave 1', w11 > w1, { w1, w11 });
  check('but at most double after ten waves', w11 <= w1 * 2.05, { w1, w11 });
  await page.evaluate('G.enemies.length = 0');

  section('groves');
  await page.evaluate('G.stored = {wood:999, stone:999, crystal:999};' +
                      'G.pads.forEach(p => { p.b = null; p.rub = null; });' +
                      'G.enemies = []; G.player.hp = G.player.maxhp = 999; openPanel(G.pads[0]);');
  check('no grove on offer without the seed pouch',
        await page.evaluate('!document.querySelector(\'[data-act="build:grove"]\')'));
  await page.evaluate('closePanel(); doBuy("tech:seeds"); openPanel(G.pads[0]);');
  check('the seed pouch unlocks it',
        await page.evaluate('!!document.querySelector(\'[data-act="build:grove"]\')'));
  await page.evaluate('doBuy("build:grove"); closePanel();');
  eq('planting puts a grove on the pad', await page.evaluate('G.pads[0].b.type'), 'grove');
  eq('it starts as a sapling with nothing on it',
     await page.evaluate('[G.pads[0].b.grow, G.pads[0].b.amount]'), [0, 0]);
  eq('nothing stops to fight a sapling',
     await page.evaluate('blockerFor(G.pads[0].x - 60, BASE_X)'), null);

  await step(60 * 25);   // BDEF.grove.grow is 24s
  eq('it matures', await page.evaluate('G.pads[0].b.grow'), 1);
  eq('and bears', await page.evaluate('G.pads[0].b.amount'), await page.evaluate('BDEF.grove.yield'));
  check('a grown grove blocks like any wall',
        await page.evaluate('blockerFor(G.pads[0].x - 60, BASE_X) === G.pads[0]'));

  await page.evaluate('G.carried = {wood:0, stone:0, crystal:0};' +
                      'G.player.x = G.pads[0].x; input.action = 1;');
  await step(60 * 4);
  await page.evaluate('input.action = 0');
  check('you can harvest it like any tree', await page.evaluate('G.carried.wood > 0'),
        await page.evaluate('G.carried'));
  eq('picking it clean starts a regrow', await page.evaluate('G.pads[0].b.amount'), 0);
  check('on the grove timer, not the wild one',
        await page.evaluate('G.pads[0].b.t > 0 && G.pads[0].b.t <= BDEF.grove.regrow'));

  await page.evaluate('hurtBuild(G.pads[0], 999)');
  eq('killing it leaves a stump', await page.evaluate('G.pads[0].rub'), 'grove');
  eq('replanting on it costs half', await page.evaluate('rebuildCost("grove")'), { wood: 12 });
  await page.evaluate('G.pads[0].rub = null; input.action = 0');

  section('game over and retry');
  await page.evaluate('G.base.hp = 0');
  await step(2);
  eq('losing the camp ends the run', await page.evaluate('state'), 'over');
  check('game-over overlay is up', await shown('#overO'));
  check('rail hidden on game over', !(await shown('#wsel')));
  await page.click('#retryB');
  eq('retry starts a fresh run', await page.evaluate('state'), 'play');
  eq('and resets the tech tree', await page.evaluate('G.levels'),
     { rock: 1, sling: 0, caster: 0, auto: 0 });
  eq('and the camp tech', await page.evaluate('G.tech'), { tools: 0, yield: 0, seeds: 0 });
  eq('and clears every pad', await page.evaluate('G.pads.filter(p => p.b).length'), 0);
  eq('and every wreck', await page.evaluate('G.pads.filter(p => p.rub).length'), 0);
  eq('rail resets too', await rail(), [
    'ROCKLV1|wbtn sel', 'SLING---|wbtn lock', 'CAST---|wbtn lock', 'AUTO---|wbtn lock']);

  section('errors');
  eq('no javascript errors', jsErrors, []);

  await browser.close();

  console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
  if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error('\ntest harness crashed:\n', e); process.exit(1); });
