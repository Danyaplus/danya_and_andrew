import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const load = (p) => readFile(path.join(root, p), 'utf8');

test('every frontend game is metadata-only and lazy-loaded', async () => {
  const games = path.join(root, 'frontend/src/games');
  const entries = await readdir(games, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = await readFile(path.join(games, entry.name, 'index.js'), 'utf8');
    assert.match(source, /lazy\(\(\) => import\(/, entry.name);
    assert.match(source, /id: /, entry.name);
    count++;
  }
  assert.equal(count, 50);
});

test('cosmetic ids are unique and all prices valid', async () => {
  const shop = JSON.parse(await load('shared/cosmetics.json'));
  assert.equal(shop.length, 34);
  assert.equal(new Set(shop.map(i => i.id)).size, shop.length);
  for (const item of shop) {
    assert.ok(item.id && item.kind && item.name);
    assert.ok(Number.isInteger(item.price) && item.price >= 0);
  }
});

test('title catalog matches server-priced SQL', async () => {
  const titles = JSON.parse(await load('shared/paidTitles.json'));
  const sql = await load('supabase/profile-showcase-titles.sql');
  for (const title of titles) {
    assert.ok(sql.includes(`when '${title.id}' then ${title.price}`), title.id);
  }
});

test('legacy standalone title shop and placeholders are removed', async () => {
  const games = await readdir(path.join(root, 'frontend/src/components'));
  assert.ok(!games.includes('ProfileTitlesShop.jsx'));
});

test('database functions required by private chat and profile exist in migration', async () => {
  const sql = await load('supabase/2026-10-28-safe-refactor.sql');
  const server = await load('backend/src/core/authStore.js');
  for (const name of ['codumi_direct_summaries', 'codumi_toggle_direct_reaction']) {
    assert.ok(sql.includes(`function public.${name}(`));
    assert.ok(server.includes(`rpc('${name}'`));
  }
  assert.ok(sql.includes('add column if not exists language'));
});

test('all game components use central guest-name helper', async () => {
  const games = path.join(root, 'frontend/src/games');
  let refactored = 0;
  for (const ent of await readdir(games, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    for (const filename of await readdir(path.join(games, ent.name))) {
      if (!filename.endsWith('.jsx')) continue;
      const source = await readFile(path.join(games, ent.name, filename), 'utf8');
      assert.ok(!source.includes('function getPlayerName()'), `${ent.name}/${filename}`);
      if (source.includes('lib/playerName.js')) refactored++;
    }
  }
  assert.equal(refactored, 47);
});

test('all relative source imports resolve after refactor', async () => {
  const roots = ['frontend/src', 'backend/src'];
  let checked = 0;
  async function walk(folder) {
    for (const ent of await readdir(folder, { withFileTypes: true })) {
      const filename = path.join(folder, ent.name);
      if (ent.isDirectory()) await walk(filename);
      else if (/\.(?:js|jsx|mjs)$/.test(filename)) {
        const source = await readFile(filename, 'utf8');
        const matchers = [...source.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g),
          ...source.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)];
        for (const [, relative] of matchers) {
          const target = path.resolve(path.dirname(filename), relative);
          try { await readFile(target); }
          catch { assert.fail(`Unresolved ${filename}: ${relative}`); }
          checked++;
        }
      }
    }
  }
  for (const dir of roots) await walk(path.join(root, dir));
  assert.ok(checked > 150);
});
