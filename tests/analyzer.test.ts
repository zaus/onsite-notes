import test from 'node:test';
import assert from 'node:assert/strict';
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

  assert.match(report, /=== SUMMARY ===/);
  assert.match(report, /2 entries, 1 projects/);
  assert.match(report, /1 days/);
  assert.match(report, /2026-02-20: 2:00\s+\|\s+1:30/);
});

test('Analyzer summarizes sample-entry fixture totals', () => {
  const analyzer = new Analyzer();
  const content = loadFixture('sample-entry.txt');

  const report = analyzer.analyze({
    '2026-02-20': content
  });

  assert.match(report, /11 entries, 1 projects/);
  assert.match(report, /1 days/);
  assert.match(report, /3:12\s+\|\s+3:07/);
  assert.match(report, /#this-topic\s+Project/);
  assert.match(report, /#another-topic\s+Project/);
});

test('Analyzer loads timestamp-only fixture and applies provided date', () => {
  const analyzer = new Analyzer();
  const content = loadFixture('timestamp-only-day.txt');

  const report = analyzer.analyze({
    '2026-02-20': content
  });

  assert.match(report, /2 entries, 1 projects/);
  assert.match(report, /2026-02-20: 2:00\s+\|\s+1:30/);
});
