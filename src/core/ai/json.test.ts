import { test, expect } from 'bun:test';
import { parseJson, extractObjects } from './json';
import { taxonomySchema, assignmentsSchema } from './schema';

test('parses a clean taxonomy object', () => {
  const out = parseJson('{"categories":[{"name":"Dev","children":["Git"]}]}', taxonomySchema);
  expect(out?.categories[0]?.name).toBe('Dev');
});

test('parses JSON wrapped in markdown fences', () => {
  const raw = 'Here you go:\n```json\n{"assignments":[{"idx":1,"cat":"News","sub":null}]}\n```';
  expect(parseJson(raw, assignmentsSchema)?.assignments[0]).toEqual({
    idx: 1,
    cat: 'News',
    sub: null,
  });
});

test('skips stray braces in reasoning and finds the schema-valid object', () => {
  const raw =
    'thinking about {maybe} this and {that}...\n\nFinal answer:\n' +
    '{"categories":[{"name":"Travel","children":[]}]}';
  expect(parseJson(raw, taxonomySchema)?.categories[0]?.name).toBe('Travel');
});

test('strips <think> reasoning before parsing', () => {
  const raw =
    '<think>I should use {wrong} shape {a:1}</think>\n{"categories":[{"name":"News","children":[]}]}';
  expect(parseJson(raw, taxonomySchema)?.categories[0]?.name).toBe('News');
});

test('returns null when nothing matches the schema', () => {
  expect(parseJson('a markdown table | x | y | no json', taxonomySchema)).toBeNull();
  // An object that parses but has the wrong shape is rejected.
  expect(parseJson('{"foo":"bar"}', taxonomySchema)).toBeNull();
});

test('respects braces inside string values', () => {
  expect(extractObjects('{"name":"a } b"}')).toEqual(['{"name":"a } b"}']);
});
