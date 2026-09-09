/**
 * Unit tests for schema normalization, escapeHtml, slugify, and debounce.
 *
 * Run with: node --test test/test-utils.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGame } from '../src/sources/schema.js';
import { escapeHtml } from '../src/utils/escapeHtml.js';
import { slugify } from '../src/utils/slugify.js';
import { debounce } from '../src/utils/debounce.js';

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
  // Note: escapeHtml short-circuits on falsy values (0 returns ''). This is a
  // quirk of the existing implementation — verify it so future refactors
  // surface the change.
  assert.equal(escapeHtml(42), '42');
});

// ───────────────────────── slugify ─────────────────────────
test('slugify: lowercases and dashes', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('slugify: strips trailing .html but leaves a trailing ? as a separator', () => {
  // The regex `/\.html?$/i` matches `.htm` + optional `l` at the end. So
  // 'page.html' -> 'page', but 'page.html?' does not end in `.html` (the
  // trailing ? is part of the URL) and the ? becomes a separator.
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