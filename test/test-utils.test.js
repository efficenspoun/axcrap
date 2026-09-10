/**
 * Unit tests for schema normalization, escapeHtml, slugify, debounce, and gameHtml.
 *
 * Run with: node --test test/test-utils.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGame } from '../src/sources/schema.js';
import { escapeHtml } from '../src/utils/escapeHtml.js';
import { slugify } from '../src/utils/slugify.js';
import { debounce } from '../src/utils/debounce.js';
import { getBaseHref, prepareGameHtml } from '../src/utils/gameHtml.js';

// ───────────────────────── schema ─────────────────────────
test('normalizeGame: empty object falls back to "Not provided" for required string fields', () => {
  const out = normalizeGame({});
  assert.equal(out.title, 'Not provided');
  assert.equal(out.author, 'Not provided');
  assert.equal(out.description, 'Not provided');
  assert.equal(out.source, 'Not provided');
  assert.equal(out.sourceUrl, 'Not provided');
  // embedUrl / thumbnailUrl fall back to empty string + default asset path
  // (not null) so callers can rely on string concatenation.
  assert.equal(out.embedUrl, '');
  assert.equal(out.thumbnailUrl, '/assets/placeholders/default-game.svg');
});

test('normalizeGame: trims string fields', () => {
  const out = normalizeGame({
    name: '  Geometry Dash  ',
    author: '  RobTop  ',
    description: '\n\n  Spicy  \n\n'
  });
  assert.equal(out.title, 'Geometry Dash');
  assert.equal(out.author, 'RobTop');
  assert.equal(out.description, 'Spicy');
});

test('normalizeGame: prefers name over title', () => {
  const out = normalizeGame({ name: 'From Name', title: 'From Title' });
  assert.equal(out.title, 'From Name');
});

test('normalizeGame: returns null for non-object input', () => {
  assert.equal(normalizeGame(null), null);
  assert.equal(normalizeGame('string'), null);
  assert.equal(normalizeGame(42), null);
});

test('normalizeGame: sourceUrl falls back through authorLink/originalUrl', () => {
  const fromAuthor = normalizeGame({ authorLink: 'https://example.com/a' });
  assert.equal(fromAuthor.sourceUrl, 'https://example.com/a');
  const fromOriginal = normalizeGame({ originalUrl: 'https://example.com/o' });
  assert.equal(fromOriginal.sourceUrl, 'https://example.com/o');
});

test('normalizeGame: mirrors array is preserved', () => {
  const mirrors = ['https://a.example/', 'https://b.example/'];
  const out = normalizeGame({ mirrors });
  assert.deepEqual(out.mirrors, mirrors);
});

test('normalizeGame: id preserved if provided', () => {
  const out = normalizeGame({ id: 'truffled_xyz' });
  assert.equal(out.id, 'truffled_xyz');
});

// ───────────────────────── escapeHtml ─────────────────────────
test('escapeHtml: encodes all five HTML-sensitive characters', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#039;');
});

test('escapeHtml: handles null/undefined/empty', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(''), '');
});

test('escapeHtml: leaves safe characters alone', () => {
  assert.equal(escapeHtml('hello world 123'), 'hello world 123');
});

test('escapeHtml: coerces truthy numbers to their string form', () => {
  assert.equal(escapeHtml(42), '42');
});

// ───────────────────────── slugify ─────────────────────────
test('slugify: lowercases and dashes', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('slugify: strips trailing .html but leaves a trailing ? as a separator', () => {
  assert.equal(slugify('page.html'), 'page');
  assert.equal(slugify('page.html?'), 'page-html');
  assert.equal(slugify('page.html?foo=bar'), 'page-html-foo-bar');
});

test('slugify: replaces non-alphanumeric runs with single dash', () => {
  assert.equal(slugify('foo   bar!!baz'), 'foo-bar-baz');
});

test('slugify: trims leading/trailing dashes', () => {
  assert.equal(slugify('---hello---'), 'hello');
});

test('slugify: falls back to "game" when empty', () => {
  assert.equal(slugify(''), 'game');
  assert.equal(slugify('!!!'), 'game');
});

// ───────────────────────── gameHtml ─────────────────────────
test('getBaseHref: extracts directory path from full URL', () => {
  assert.equal(getBaseHref('https://example.com/games/action/index.html'), 'https://example.com/games/action/');
  assert.equal(getBaseHref('https://example.com/games/play.html?v=2#top'), 'https://example.com/games/');
  assert.equal(getBaseHref('https://cdn.jsdelivr.net/gh/user/repo@main/game.html'), 'https://cdn.jsdelivr.net/gh/user/repo@main/');
});

test('prepareGameHtml: injects <base> and <meta charset> into existing <head>', () => {
  const input = '<html><head><title>Test Game</title></head><body><h1>Play</h1></body></html>';
  const output = prepareGameHtml(input, 'https://cdn.example.com/games/game1/index.html');
  assert.ok(output.includes('<base href="https://cdn.example.com/games/game1/">'));
  assert.ok(output.includes('<meta charset="utf-8">'));
});

test('prepareGameHtml: strips conflicting existing <base> tags', () => {
  const input = '<html><head><base href="/"><title>Game</title></head><body></body></html>';
  const output = prepareGameHtml(input, 'https://cdn.example.com/games/game1/index.html');
  assert.ok(!output.includes('<base href="/">'));
  assert.ok(output.includes('<base href="https://cdn.example.com/games/game1/">'));
});

test('prepareGameHtml: creates synthetic <head> when only <html> exists', () => {
  const input = '<html><body><h1>No head</h1></body></html>';
  const output = prepareGameHtml(input, 'https://cdn.example.com/games/game1/index.html');
  assert.ok(output.includes('<head><meta charset="utf-8"><base href="https://cdn.example.com/games/game1/"></head>'));
});

test('prepareGameHtml: prepends <head> when neither <html> nor <head> exists', () => {
  const input = '<canvas id="game"></canvas><script src="main.js"></script>';
  const output = prepareGameHtml(input, 'https://cdn.example.com/games/game1/index.html');
  assert.ok(output.startsWith('<head><meta charset="utf-8"><base href="https://cdn.example.com/games/game1/"></head>'));
});

// ───────────────────────── debounce ─────────────────────────
test('debounce: coalesces rapid calls into one trailing invocation', async () => {
  let calls = 0;
  const fn = debounce(() => { calls += 1; }, 30);
  fn(); fn(); fn();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, 1);
});

test('debounce: cancel discards pending invocation', async () => {
  let calls = 0;
  const fn = debounce(() => { calls += 1; }, 30);
  fn();
  fn.cancel();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, 0);
});

test('debounce: flush runs immediately', async () => {
  let calls = 0;
  const fn = debounce(() => { calls += 1; }, 1000);
  fn();
  fn.flush();
  assert.equal(calls, 1);
});

test('debounce: forwards arguments to the wrapped function', async () => {
  let received = null;
  const fn = debounce((x) => { received = x; }, 20);
  fn('hello');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(received, 'hello');
});
