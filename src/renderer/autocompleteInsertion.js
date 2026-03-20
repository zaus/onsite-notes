import { TIMESTAMP_PREFIX_RE } from '../main/parser';

export function shouldInsertProjectWithTag({ lineText, startInLine, type, item }) {
  if (type !== 'tag') return false;

  const project = item?.project?.trim();
  if (!project) return false;

  const textBeforePrefix = lineText.slice(0, startInLine);
  const timestampMatch = TIMESTAMP_PREFIX_RE.exec(textBeforePrefix);
  if (!timestampMatch) return false;

  return textBeforePrefix.slice(timestampMatch[0].length).trim() === '';
}

export function buildAutocompleteInsertText({ lineText, startInLine, type, item }) {
  const project = item?.project?.trim();
  if (shouldInsertProjectWithTag({ lineText, startInLine, type, item }) && project) {
    return `${item.id}\t${project}`;
  }

  return item.id;
}
