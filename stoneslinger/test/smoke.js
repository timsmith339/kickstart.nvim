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
  panelOpen = was;
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

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
  eq('rail resets too', await rail(), [
    'ROCKLV1|wbtn sel', 'SLING---|wbtn lock', 'CAST---|wbtn lock', 'AUTO---|wbtn lock']);

  section('errors');
  eq('no javascript errors', jsErrors, []);

  await browser.close();

  console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
  if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error('\ntest harness crashed:\n', e); process.exit(1); });
