export interface LogEntry {
  timestamp: string;       // HH:MM
  date: string;            // YYYY-MM-DD
  type: 'tag' | 'mention' | 'plain';
  id: string | null;       // #TAG or @mention
  project: string | null;
  details: string;
  lineNumber: number;
  isContinuation: boolean;
  todos: Array<{ state: string; text: string }>;
  durationMinutes: number | null;
}

const TIMESTAMP_WITH_DATE_RE = /^(\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2})\s/;
const TIMESTAMP_ONLY_RE = /^(\d{2}:\d{2})\s/;
export const TIMESTAMP_PREFIX_RE = /^(\d{2}:\d{2})(?:\s+\d{4}-\d{2}-\d{2})?\s+/;
const TODO_RE = /\[([ x✔v~])\]|(NOW|DOING|LATER|DONE|CANCELED)\b/g;

function parseTodoState(marker: string | undefined): string {
  switch (marker) {
    case ' ': return 'LATER';
    case '~': return 'DOING';
    case '✔': case 'v': return 'DONE';
    case 'x': return 'CANCELED';
    default: return marker || ''; // NOW, DOING, etc.
  }
}

export function parseEntries(content: string, defaultDate: string): LogEntry[] {
  const lines = content.split('\n');
  const entries: LogEntry[] = [];
  let currentEntry: LogEntry | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();

    if (!line) continue; // skip empty lines

    // Day delimiter
    if (/^[-=]{3,}/.test(line)) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = null;
      continue;
    }

    const tsWithDateMatch = TIMESTAMP_WITH_DATE_RE.exec(line);
    const tsOnlyMatch = tsWithDateMatch ? null : TIMESTAMP_ONLY_RE.exec(line);

    if (tsWithDateMatch || tsOnlyMatch) {
      if (currentEntry) entries.push(currentEntry);

      const timestamp = (tsWithDateMatch ? tsWithDateMatch[1] : tsOnlyMatch![1]) || '00:00';
      const date = (tsWithDateMatch ? tsWithDateMatch[2] : defaultDate) || defaultDate;
      const matchedPrefix = tsWithDateMatch ? tsWithDateMatch[0] : tsOnlyMatch![0];
      const rest = line.slice(matchedPrefix.length);
      const parts = rest.split('\t');

      let type: 'tag' | 'mention' | 'plain' = 'plain';
      let id: string | null = null;
      let project: string | null = null;
      let details = '';

      if (parts.length >= 1) {
        const first = parts[0]!.trim();
        if (first.startsWith('#')) {
          type = 'tag';
          id = first;
        } else if (first.startsWith('@')) {
          type = 'mention';
          id = first;
        } else {
          details = first;
        }
      }

      if (type !== 'plain' && parts.length >= 2) {
        project = parts[1]!.trim() || null;
        details = parts.slice(2).join('\t').trim();
      }

      // Extract todos from details
      const todos: Array<{ state: string; text: string }> = [];
      let match: RegExpExecArray | null;
      TODO_RE.lastIndex = 0;
      while ((match = TODO_RE.exec(details)) !== null) {
        const state = match[2] || parseTodoState(match[1]);
        todos.push({ state, text: details });
      }

      currentEntry = {
        timestamp,
        date,
        type,
        id,
        project,
        details,
        lineNumber: i,
        isContinuation: false,
        todos,
        durationMinutes: null
      };
    } else if (line.startsWith('\t') && currentEntry) {
      // Continuation line
      currentEntry.details += '\n' + line.slice(1);
    }
  }

  if (currentEntry) entries.push(currentEntry);

  // Calculate durations
  for (let i = 0; i < entries.length - 1; i++) {
    const curr = entries[i]!;
    const next = entries[i + 1]!;
    if (curr.date === next.date) {
      const [ch, cm] = curr.timestamp.split(':').map(Number);
      const [nh, nm] = next.timestamp.split(':').map(Number);

      if (nh === undefined || ch === undefined || nm === undefined || cm === undefined)
        throw new Error(`Invalid timestamp format at line ${curr.lineNumber + 1} or ${next.lineNumber + 1}`);

      curr.durationMinutes = (nh * 60 + nm) - (ch * 60 + cm);
      if (curr.durationMinutes < 0) curr.durationMinutes = null;
    }
  }

  // drop the last entry, which should have an unknown duration
  if (entries.length > 0 && entries[entries.length - 1]!.durationMinutes === null)
    entries.pop();

  return entries;
}
