import { expect, test } from 'vitest';
import { buildAutocompleteInsertText, shouldInsertProjectWithTag } from '../src/renderer/autocompleteInsertion.js';

test('inserts id and project for first tag after timestamp with inline date', () => {
  const lineText = '09:15 2026-03-20 #wo';
  const item = { id: '#work', project: 'ACME' };
  const startInLine = lineText.lastIndexOf('#');

  expect(shouldInsertProjectWithTag({ lineText, startInLine, type: 'tag', item })).toBe(true);
  expect(buildAutocompleteInsertText({ lineText, startInLine, type: 'tag', item })).toBe('#work\tACME');
});

test('inserts id and project for first tag after timestamp without inline date', () => {
  const lineText = '09:15 #wo';
  const item = { id: '#work', project: 'ACME' };
  const startInLine = lineText.lastIndexOf('#');

  expect(shouldInsertProjectWithTag({ lineText, startInLine, type: 'tag', item })).toBe(true);
  expect(buildAutocompleteInsertText({ lineText, startInLine, type: 'tag', item })).toBe('#work\tACME');
});

test('inserts only id when tag is not first token after timestamp', () => {
  const lineText = '09:15 2026-03-20 note #wo';
  const item = { id: '#work', project: 'ACME' };
  const startInLine = lineText.lastIndexOf('#');

  expect(shouldInsertProjectWithTag({ lineText, startInLine, type: 'tag', item })).toBe(false);
  expect(buildAutocompleteInsertText({ lineText, startInLine, type: 'tag', item })).toBe('#work');
});

test('inserts only id when tag is in the middle of a line', () => {
  const lineText = '09:15 2026-03-20	#someTask	Project	continuation of another tag #wo';
  const item = { id: '#work', project: 'ACME' };
  const startInLine = lineText.lastIndexOf('#');

  expect(shouldInsertProjectWithTag({ lineText, startInLine, type: 'tag', item })).toBe(false);
  expect(buildAutocompleteInsertText({ lineText, startInLine, type: 'tag', item })).toBe('#work');
});

test('inserts only id when indented and not a new entry line', () => {
  const lineText = '	09:15 2026-03-20	#wo';
  const item = { id: '#work', project: 'ACME' };
  const startInLine = lineText.lastIndexOf('#');

  expect(shouldInsertProjectWithTag({ lineText, startInLine, type: 'tag', item })).toBe(false);
  expect(buildAutocompleteInsertText({ lineText, startInLine, type: 'tag', item })).toBe('#work');
});

test('inserts only id for mention even after timestamp', () => {
  const lineText = '09:15 2026-03-20 @al';
  const item = { id: '@alice', project: 'ACME' };
  const startInLine = lineText.lastIndexOf('@');

  expect(shouldInsertProjectWithTag({ lineText, startInLine, type: 'mention', item })).toBe(false);
  expect(buildAutocompleteInsertText({ lineText, startInLine, type: 'mention', item })).toBe('@alice');
});

test('inserts only id when project is empty', () => {
  const lineText = '09:15 2026-03-20 #wo';
  const item = { id: '#work', project: '   ' };
  const startInLine = lineText.lastIndexOf('#');

  expect(shouldInsertProjectWithTag({ lineText, startInLine, type: 'tag', item })).toBe(false);
  expect(buildAutocompleteInsertText({ lineText, startInLine, type: 'tag', item })).toBe('#work');
});
