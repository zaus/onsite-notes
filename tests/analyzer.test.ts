import { test, expect } from 'vitest';
import { Analyzer } from '../src/main/analyzer';
import { loadFixture } from './helpers/fixtures';

test('Analyzer includes day activity for timestamp-only entries', () => {
  const analyzer = new Analyzer();

  const report = analyzer.analyze({
    '2026-02-20': [
      '09:00 #WORK\tACME\tStart feature',
      '10:30 @break\t\tCoffee',
      '11:00 #WORK\tACME\tResume feature'
    ].join('\n')
  });

  expect(report).toMatch(/=== SUMMARY ===/);
  expect(report).toMatch(/2 entries, 1 projects/);
  expect(report).toMatch(/1 days/);
  expect(report).toMatch(/2026-02-20\s+2:00\s+\|\s+1:30/);
});

test('Analyzer summarizes sample-entry fixture totals', () => {
  const analyzer = new Analyzer();
  const content = loadFixture('sample-entry.txt');

  const report = analyzer.analyze({
    '2026-02-20': content
  });

  expect(report).toMatch(/11 entries, 1 projects/);
  expect(report).toMatch(/1 days/);
  expect(report).toMatch(/3:12\s+\|\s+3:07/);
  expect(report).toMatch(/#this-topic\s+Project/);
  expect(report).toMatch(/#another-topic\s+Project/);
});

test('Analyzer loads timestamp-only fixture and applies provided date', () => {
  const analyzer = new Analyzer();
  const content = loadFixture('timestamp-only-day.txt');

  const report = analyzer.analyze({
    '2026-02-20': content
  });

  expect(report).toMatch(/2 entries, 1 projects/);
  expect(report).toMatch(/2026-02-20\s+2:00\s+\|\s+1:30/);
});
