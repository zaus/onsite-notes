import { EditorState, EditorSelection, Prec } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, Decoration, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history, insertNewlineAndIndent } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { AutocompleteWidget } from './autocomplete.js';
import { showPromptModal } from './promptModal.js';
import { openModal } from './modalShell.js';

const electronAPI = window.electronAPI;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNow() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return { time: `${hh}:${mm}`, date: `${yyyy}-${mo}-${dd}` };
}

function todayDate() {
  return getNow().date;
}

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mo}-${dd}`;
}

function insertTabCharacter(view) {
  const changes = [];
  const nextRanges = [];

  for (const range of view.state.selection.ranges) {
    changes.push({ from: range.from, to: range.to, insert: '\t' });
    const cursor = range.from + 1;
    nextRanges.push(EditorSelection.cursor(cursor));
  }

  view.dispatch({
    changes,
    selection: EditorSelection.create(nextRanges),
    userEvent: 'input'
  });

  return true;
}

function outdentSelection(view) {
  const lineNumbers = new Set();

  for (const range of view.state.selection.ranges) {
    const startLineNumber = view.state.doc.lineAt(range.from).number;
    let endPosition = range.to;

    if (range.from !== range.to && endPosition > 0 && view.state.doc.sliceString(endPosition - 1, endPosition) === '\n') {
      endPosition -= 1;
    }

    const endLineNumber = view.state.doc.lineAt(endPosition).number;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      lineNumbers.add(lineNumber);
    }
  }

  const changes = [];
  const sortedLineNumbers = Array.from(lineNumbers).sort((a, b) => a - b);

  for (const lineNumber of sortedLineNumbers) {
    const line = view.state.doc.line(lineNumber);
    if (line.text.startsWith('\t')) {
      changes.push({ from: line.from, to: line.from + 1, insert: '' });
      continue;
    }

    const leadingSpaces = line.text.match(/^ +/);
    if (leadingSpaces) {
      const removeCount = Math.min(4, leadingSpaces[0].length);
      changes.push({ from: line.from, to: line.from + removeCount, insert: '' });
    }
  }

  if (changes.length > 0) {
    view.dispatch({
      changes,
      userEvent: 'input'
    });
  }

  return true;
}

// ─── Syntax Decorations ───────────────────────────────────────────────────────

const markTag = Decoration.mark({ class: 'tok-tag' });
const markMention = Decoration.mark({ class: 'tok-mention' });
const markUrl = Decoration.mark({ class: 'tok-url' });
const markBullet = Decoration.mark({ class: 'tok-bullet' });
const markCode = Decoration.mark({ class: 'tok-code' });
const markCodeBlock = Decoration.mark({ class: 'tok-codeblock' });
const markScm = Decoration.mark({ class: 'tok-scm' });
const markTodoDone = Decoration.mark({ class: 'tok-todo-done' });
const markTodoCanceled = Decoration.mark({ class: 'tok-todo-canceled' });
const markTodoLater = Decoration.mark({ class: 'tok-todo-later' });
const markTodoDoing = Decoration.mark({ class: 'tok-todo-doing' });
const markTimestamp = Decoration.mark({ class: 'tok-timestamp' });

function applyLineDecorations(line, lineStart, decorations) {
  if (!line) return;

  // Timestamp at start
  const tsMatch = /^(\d{2}:\d{2}\s+\d{4}-\d{2}-\d{2})/.exec(line);
  if (tsMatch) {
    decorations.push(markTimestamp.range(lineStart, lineStart + tsMatch[1].length));
  }

  // Bullet lines
  if (/^[\t ]*[-*~][\t ]/.test(line) || /^[\t ]*\.\:/.test(line)) {
    decorations.push(markBullet.range(lineStart, lineStart + line.length));
    return;
  }

  // SCM comment lines
  if (/^(GIT:|SVN:|AWS:)/.test(line)) {
    decorations.push(markScm.range(lineStart, lineStart + line.length));
    return;
  }

  // TODOs
  const todoPatterns = [
    { re: /\[✔\]|\[v\]/g, mark: markTodoDone },
    { re: /\[x\]/g, mark: markTodoCanceled },
    { re: /\[ \]/g, mark: markTodoLater },
    { re: /\[~\]/g, mark: markTodoDoing },
  ];
  for (const { re, mark } of todoPatterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      decorations.push(mark.range(lineStart + m.index, lineStart + m.index + m[0].length));
    }
  }

  // Code blocks { ... }
  let inBlock = false;
  let blockStart = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '{' && !inBlock) { inBlock = true; blockStart = i; }
    else if (line[i] === '}' && inBlock) {
      decorations.push(markCodeBlock.range(lineStart + blockStart, lineStart + i + 1));
      inBlock = false;
    }
  }

  // Inline code `...`
  const codeRe = /`[^`]+`/g;
  let cm;
  while ((cm = codeRe.exec(line)) !== null) {
    decorations.push(markCode.range(lineStart + cm.index, lineStart + cm.index + cm[0].length));
  }

  // URLs
  const urlRe = /https?:\/\/[^\s\t]+/g;
  let um;
  while ((um = urlRe.exec(line)) !== null) {
    decorations.push(markUrl.range(lineStart + um.index, lineStart + um.index + um[0].length));
  }

  // Tags and Mentions
  const idRe = /(?:^|\t|\s)(#[\w.-]*|@[\w.-]*)/g;
  let im;
  while ((im = idRe.exec(line)) !== null) {
    const fullMatch = im[0];
    const id = im[1];
    const idStart = lineStart + im.index + (fullMatch.length - id.length);
    const mark = id.startsWith('#') ? markTag : markMention;
    decorations.push(mark.range(idStart, idStart + id.length));
  }
}

function buildDecorations(view) {
  const decorations = [];
  for (const { from, to } of view.visibleRanges) {
    let lineStart = from;
    for (let i = from; i <= to; i++) {
      const ch = i < to ? view.state.doc.sliceString(i, i + 1) : '\n';
      if (ch === '\n' || i === to) {
        const lineText = view.state.doc.sliceString(lineStart, i);
        applyLineDecorations(lineText, lineStart, decorations);
        lineStart = i + 1;
      }
    }
  }
  return Decoration.set(decorations, true);
}

const syntaxPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildDecorations(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildDecorations(update.view);
    }
  }
}, { decorations: v => v.decorations });

// ─── App State ────────────────────────────────────────────────────────────────

const editorContainer = document.getElementById('editor-container');
const autocompleteContainer = document.getElementById('autocomplete-container');
const statusFile = document.getElementById('status-file');
const statusTime = document.getElementById('status-time');
const currentTimeEl = document.getElementById('current-time');

const autocomplete = new AutocompleteWidget(autocompleteContainer);

let editors = []; // [{date, view, section}]
let saveTimers = {};
let activeEditorIndex = 0;
let currentNotebook = 'default';
let priorDays = 3;

function clearEditors() {
  for (const editor of editors) {
    editor.view.destroy();
  }

  for (const timer of Object.values(saveTimers)) {
    clearTimeout(timer);
  }

  saveTimers = {};
  editors = [];
  activeEditorIndex = 0;
  editorContainer.innerHTML = '';
}

async function switchNotebook(notebookName) {
  const result = await electronAPI.setNotebook(notebookName);
  currentNotebook = result.currentNotebook;
  clearEditors();
  await loadEditors();
}

function requestNotebookName() {
  // If prompt requirements grow (multi-field, rich validation, etc.), evaluate migrating to electron-prompt.
  return showPromptModal({
    titleText: 'New Notebook',
    labelText: 'Notebook name',
    placeholder: 'home-life',
    confirmText: 'Create',
    validate: (value) => value.length > 0 || 'Notebook name is required.'
  });
}

function updateTime() {
  const { time, date } = getNow();
  const display = `${time} ${date}`;
  if (currentTimeEl) currentTimeEl.textContent = display;
  if (statusTime) statusTime.textContent = display;
}
setInterval(updateTime, 1000);
updateTime();

async function loadEditors() {
  const config = await electronAPI.getConfig();
  priorDays = config.priorDays || 3;
  currentNotebook = config.currentNotebook || currentNotebook;

  const today = todayDate();

  const dates = [];
  for (let i = priorDays; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mo}-${dd}`);
  }

  clearEditors();

  for (const date of dates) {
    const content = await electronAPI.readFile(date) || null;
    // skip non-existent files (null) but still create editors for empty files ('')
    if (content === null) {
      // but always create an editor for today
      if (date === today) content = '';
      else continue;
    }

    const section = document.createElement('div');
    section.className = 'day-section';

    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = date + (date === today ? ' (today)' : '');
    section.appendChild(header);

    const editorDiv = document.createElement('div');
    section.appendChild(editorDiv);
    editorContainer.appendChild(section);

    const isToday = date === today;
    const view = createEditor(editorDiv, content, date, isToday);
    editors.push({ date, view, section });

    if (content) {
      await electronAPI.indexContent(date, content);
    }
  }

  // Focus today's editor
  if (editors.length > 0) {
    activeEditorIndex = editors.length - 1;
    editors[activeEditorIndex].view.focus();
    statusFile.textContent = editors[activeEditorIndex].date + '.txt';
  }

  // Scroll to bottom of today
  setTimeout(() => {
    const last = editors[editors.length - 1];
    if (last) {
      last.section.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, 100);
}

function createEditor(container, content, date, isToday) {
  const saveDoc = async (docContent) => {
    await electronAPI.writeFile(date, docContent);
    await electronAPI.indexContent(date, docContent);
  };

  const tabKeymap = Prec.highest(keymap.of([
    {
      key: 'Tab',
      run: (view) => insertTabCharacter(view)
    },
    {
      key: 'Shift-Tab',
      run: (view) => outdentSelection(view)
    }
  ]));

  const autoSavePlugin = ViewPlugin.fromClass(class {
    update(update) {
      if (update.docChanged) {
        if (saveTimers[date]) clearTimeout(saveTimers[date]);
        saveTimers[date] = setTimeout(() => {
          saveDoc(update.state.doc.toString());
        }, 1000);
      }
    }
  });

  const state = EditorState.create({
    doc: content,
    extensions: [
      history(),
      tabKeymap,
      indentUnit.of('\t'),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        {
          key: 'F9',
          run: (view) => { insertTimestamp(view, date); return true; }
        },
        {
          key: 'Ctrl-F9',
          run: (view) => { insertEndDay(view, date); return true; }
        },
        {
          key: 'F5',
          run: (view) => { cycleTodo(view); return true; }
        },
        {
          key: 'F1',
          run: () => { showAnalysis(); return true; }
        },
        {
          key: 'ArrowDown',
          run: () => {
            if (autocomplete.visible) {
              autocomplete.moveSelection(1);
              return true;
            }
            return false;
          }
        },
        {
          key: 'ArrowUp',
          run: () => {
            if (autocomplete.visible) {
              autocomplete.moveSelection(-1);
              return true;
            }
            return false;
          }
        },
        {
          key: 'Enter',
          run: (view) => {
            if (autocomplete.visible) {
              return autocomplete.confirmSelection();
            }
            return insertNewlineAndIndent(view);
          }
        },
        {
          key: 'Escape',
          run: () => {
            if (autocomplete.visible) {
              autocomplete.hide();
              return true;
            }
            return false;
          }
        }
      ]),
      syntaxPlugin,
      autoSavePlugin,
      // drawSelection(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      EditorView.updateListener.of((update) => {
        if (update.focusChanged && update.view.hasFocus) {
          activeEditorIndex = editors.findIndex(e => e.view === update.view);
          if (activeEditorIndex >= 0) {
            statusFile.textContent = editors[activeEditorIndex].date + '.txt';
          }
        }
        if (update.docChanged) {
          handleAutocomplete(update.view);
        }
      }),
      EditorView.domEventHandlers({
        keydown: (event, view) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
              return outdentSelection(view);
            }
            return insertTabCharacter(view);
          }
          return false;
        },
        click: (e, view) => {
          if (e.ctrlKey) {
            handleCtrlClick(e, view);
          }
        }
      }),
      EditorView.theme({
        '&': { height: '100%', background: '#1e1e1e', color: '#d4d4d4' },
        // using drawSelection obviates caretColor, but then screws up selection styling? not using it obviates .cm-cursor?
        '.cm-content': { fontFamily: "'DejaVu Sans Mono', 'Courier New', monospace", fontSize: '13px', caretColor: '#fbff7d' },
        '.cm-cursor': { borderLeftColor: '#ffa47d', borderLeftWidth: '2px' },
        '.cm-selectionBackground': { background: '#264f78' },
        '&.cm-focused .cm-selectionBackground': { background: '#172d43' },
        '.cm-gutters': { background: '#1e1e1e', borderRight: '1px solid #333', color: '#555' },
        '.cm-activeLineGutter': { background: '#2a2a2a' },
        '.cm-activeLine': { background: '#2a2d2e' },
      }),
      EditorView.lineWrapping,
    ]
  });

  const view = new EditorView({ state, parent: container });
  return view;
}

function insertTimestamp(view, date) {
  const { time, date: nowDate } = getNow();
  const ts = `${time} ${nowDate}\t`;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const lineText = line.text;

  const posInLine = sel.head - line.from;
  let insertPos = sel.head;
  let insertText = ts;

  if (posInLine === 0 || lineText.trim() === '') {
    insertText = ts;
    insertPos = line.from + (lineText.match(/^\t*/)?.[0].length || 0);
  } else {
    insertText = ` ${time} `;
  }

  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: insertText },
    selection: { anchor: insertPos + insertText.length }
  });
}

function insertEndDay(view, date) {
  const { time, date: nowDate } = getNow();
  const ts = `${time} ${nowDate}\tdone\n---------------------\n`;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const insertPos = line.to;

  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: '\n' + ts },
    selection: { anchor: insertPos + ts.length + 1 }
  });
}

function cycleTodo(view) {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const text = line.text;

  const cycles = [
    { from: '[ ]', to: '[~]' },
    { from: '[~]', to: '[✔]' },
    { from: '[✔]', to: '[x]' },
    { from: '[x]', to: '[ ]' },
    { from: null, to: '[ ] ' },
  ];

  for (const cycle of cycles) {
    if (cycle.from === null) {
      view.dispatch({
        changes: { from: sel.head, to: sel.head, insert: '[ ] ' }
      });
      break;
    }
    const idx = text.indexOf(cycle.from);
    if (idx !== -1) {
      view.dispatch({
        changes: { from: line.from + idx, to: line.from + idx + cycle.from.length, insert: cycle.to }
      });
      break;
    }
  }
}

async function handleAutocomplete(view) {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const lineText = line.text;
  const posInLine = sel.head - line.from;
  const textBefore = lineText.slice(0, posInLine);

  const match = /(#\w*|@\w*)$/.exec(textBefore);
  if (!match) {
    autocomplete.hide();
    return;
  }

  const prefix = match[1];
  const type = prefix.startsWith('#') ? 'tag' : 'mention';

  const items = await electronAPI.getAutocomplete(prefix, type);
  if (!items || items.length === 0) {
    autocomplete.hide();
    return;
  }

  const coords = view.coordsAtPos(sel.head);
  if (!coords) return;

  autocomplete.show(items, { x: coords.left, y: coords.bottom + 2 }, (item) => {
    const start = sel.head - prefix.length;
    view.dispatch({
      changes: { from: start, to: sel.head, insert: item.id },
      selection: { anchor: start + item.id.length }
    });
    view.focus();
  });
}

async function handleCtrlClick(event, view) {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return;

  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const posInLine = pos - line.from;

  const idRe = /(#\w[\w.-]*|@\w[\w.-]*)/g;
  let m;
  let found = null;
  while ((m = idRe.exec(text)) !== null) {
    if (m.index <= posInLine && posInLine <= m.index + m[0].length) {
      found = m[1];
      break;
    }
  }

  if (!found) return;

  const sidebar = document.getElementById('sidebar');
  const sidebarTitle = document.getElementById('sidebar-title');
  const sidebarContent = document.getElementById('sidebar-content');

  sidebarTitle.textContent = found;
  sidebarContent.innerHTML = 'Loading...';
  sidebar.classList.remove('hidden');

  sidebarContent.innerHTML = `<div class="sidebar-link"><div class="link-context">Ctrl+click detected: ${found}</div><div class="link-date">Use analysis (F1) to see all references</div></div>`;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

function showAnalysis() {
  const template = document.getElementById('analysis-modal-template');
  const content = template?.content?.cloneNode(true);
  if (!content) return;

  const rangeRadios = content.querySelectorAll('input[name="analysis-range"]');
  const formatRadios = content.querySelectorAll('input[name="analysis-format"]');
  const customRange = content.querySelector('#custom-range');
  const rangeStartInput = content.querySelector('#range-start');
  const rangeEndInput = content.querySelector('#range-end');
  const analysisOutput = content.querySelector('#analysis-output');
  if (!customRange || !rangeStartInput || !rangeEndInput || !analysisOutput || rangeRadios.length === 0 || formatRadios.length === 0) return;

  analysisOutput.addEventListener('dblclick', (event) => {
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(analysisOutput);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  rangeRadios.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      customRange.classList.toggle('hidden', event.target.value !== 'custom');
    });
  });

  openModal({
    titleText: 'Analysis',
    content,
    confirmText: 'Run',
    cancelText: 'Close',
    onConfirm: async () => {
      const selectedRange = Array.from(rangeRadios).find((radio) => radio.checked);
      const selectedFormat = Array.from(formatRadios).find((radio) => radio.checked);
      if (!selectedRange || !selectedFormat) return false;

      const range = selectedRange.value;
      const format = selectedFormat.value;
      const today = todayDate();
      let startDate;
      let endDate;

      if (range === 'today') {
        startDate = endDate = today;
      } else if (range === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        startDate = formatDate(d);
        endDate = today;
      } else {
        startDate = rangeStartInput.value;
        endDate = rangeEndInput.value;
        if (!startDate || !endDate) {
          analysisOutput.textContent = 'Please select a date range.';
          return false;
        }
      }

      analysisOutput.textContent = 'Running analysis...';
      const result = await electronAPI.analyze(startDate, endDate, format);
      if (format === 'html') {
        analysisOutput.classList.remove('text');
        analysisOutput.innerHTML = result;
      } else {
        analysisOutput.classList.add('text');
        analysisOutput.textContent = result;
      }

      return false;
    }
  });
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

document.getElementById('btn-timestamp').addEventListener('click', () => {
  if (editors[activeEditorIndex]) {
    insertTimestamp(editors[activeEditorIndex].view, editors[activeEditorIndex].date);
  }
});

document.getElementById('btn-endday').addEventListener('click', () => {
  if (editors[activeEditorIndex]) {
    insertEndDay(editors[activeEditorIndex].view, editors[activeEditorIndex].date);
  }
});

document.getElementById('btn-analysis').addEventListener('click', showAnalysis);

document.getElementById('sidebar-close').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('hidden');
});

if (electronAPI.onNotebookChanged) {
  electronAPI.onNotebookChanged(async (payload) => {
    currentNotebook = payload.currentNotebook;
    clearEditors();
    await loadEditors();
  });
}

if (electronAPI.onCreateNotebookRequested) {
  electronAPI.onCreateNotebookRequested(async () => {
    const enteredName = await requestNotebookName();
    if (!enteredName) return;
    await switchNotebook(enteredName);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

loadEditors().catch(console.error);
