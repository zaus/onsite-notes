import { test, expect } from 'vitest';
import { parseEntries } from '../src/main/parser';
import { loadFixture } from './helpers/fixtures';

test('parseEntries uses default date for timestamp-only lines', () => {
  const content = [
    '09:00 #WORK\tACME\tStart feature',
    '10:30 @break\t\tCoffee',
    '11:00 #WORK\tACME\tResume feature',
    '12:00 done'
  ].join('\n');

  const entries = parseEntries(content, '2026-02-20');

  expect(entries.length).toBe(3);
  expect(entries[0]?.date).toBe('2026-02-20');
  expect(entries[1]?.date).toBe('2026-02-20');
  expect(entries[2]?.date).toBe('2026-02-20');
  expect(entries[0]?.durationMinutes).toBe(90);
  expect(entries[1]?.durationMinutes).toBe(30);
  expect(entries[2]?.durationMinutes).toBe(60);
});

test('parseEntries preserves explicit inline date when present', () => {
  const content = [
    '09:00 2026-02-19 #WORK\tACME\tCarryover',
    '10:00 2026-02-19 #WORK\tACME\tContinue',
    '11:00 2026-02-19\tDone'
  ].join('\n');

  const entries = parseEntries(content, '2026-02-20');

  expect(entries.length).toBe(2);
  expect(entries[0]?.date).toBe('2026-02-19');
  expect(entries[1]?.date).toBe('2026-02-19');
  expect(entries[0]?.durationMinutes).toBe(60);
});

test('parseEntries parses entries from sample-entry fixture', () => {
  const content = loadFixture('sample-entry.txt');

  const entries = parseEntries(content, '2026-02-20');

  console.table(entries);

  expect(entries.length).toBe(12); // drops the last entry with unknown duration
  expect(entries[0]?.date).toBe('2026-02-20');
  expect(entries[0]?.durationMinutes).toBe(1);
  expect(entries[3]?.type).toBe('tag');
  expect(entries[3]?.id).toBe('#this-topic');
  expect(entries[3]?.durationMinutes).toBe(120);
  expect(entries[4]?.durationMinutes).toBe(37);
  expect(entries[5]?.id).toBe('#another-topic');
});

test('parseEntries parses timestamp-only fixture with default date', () => {
  const content = loadFixture('timestamp-only-day.txt');

  const entries = parseEntries(content, '2026-02-20');

  expect(entries.length).toBe(2);
  expect(entries.map((entry) => entry.date)).toEqual(['2026-02-20', '2026-02-20']);
  expect(entries[0]?.durationMinutes).toBe(90);
  expect(entries[1]?.durationMinutes).toBe(30);
});
