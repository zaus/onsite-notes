import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntries } from '../src/main/parser';
import { loadFixture } from './helpers/fixtures';

test('parseEntries uses default date for timestamp-only lines', () => {
  const content = [
    '09:00 #WORK\tACME\tStart feature',
    '10:30 @break\t\tCoffee',
    '11:00 #WORK\tACME\tResume feature'
  ].join('\n');

  const entries = parseEntries(content, '2026-02-20');

  assert.equal(entries.length, 3);
  assert.equal(entries[0].date, '2026-02-20');
  assert.equal(entries[1].date, '2026-02-20');
  assert.equal(entries[2].date, '2026-02-20');
  assert.equal(entries[0].durationMinutes, 90);
  assert.equal(entries[1].durationMinutes, 30);
  assert.equal(entries[2].durationMinutes, null);
});

test('parseEntries preserves explicit inline date when present', () => {
  const content = [
    '09:00 2026-02-19 #WORK\tACME\tCarryover',
    '10:00 2026-02-19 #WORK\tACME\tContinue'
  ].join('\n');

  const entries = parseEntries(content, '2026-02-20');

  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, '2026-02-19');
  assert.equal(entries[1].date, '2026-02-19');
  assert.equal(entries[0].durationMinutes, 60);
});

test('parseEntries parses entries from sample-entry fixture', () => {
  const content = loadFixture('sample-entry.txt');

  const entries = parseEntries(content, '2026-02-20');

  assert.equal(entries.length, 13);
  assert.equal(entries[0].date, '2026-02-20');
  assert.equal(entries[0].durationMinutes, 1);
  assert.equal(entries[3].type, 'tag');
  assert.equal(entries[3].id, '#this-topic');
  assert.equal(entries[3].durationMinutes, 120);
  assert.equal(entries[4].durationMinutes, 37);
  assert.equal(entries[5].id, '#another-topic');
});

test('parseEntries parses timestamp-only fixture with default date', () => {
  const content = loadFixture('timestamp-only-day.txt');

  const entries = parseEntries(content, '2026-02-20');

  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((entry) => entry.date), ['2026-02-20', '2026-02-20', '2026-02-20']);
  assert.equal(entries[0].durationMinutes, 90);
  assert.equal(entries[1].durationMinutes, 30);
});
