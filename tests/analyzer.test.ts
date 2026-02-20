import test from 'node:test';
import assert from 'node:assert/strict';
import { Analyzer } from '../dist/main/analyzer.js';

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
