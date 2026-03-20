import { EditorState, EditorSelection, Prec } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history, insertNewlineAndIndent } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';

// custom language for tracker syntax highlighting
import { trackerSyntax } from './language-tracker';

// native CTRL+F for single editor
// import { searchKeymap } from '@codemirror/search';
// global search service for searching across all editors and managing the search dialog state
import { registerAllForSearch, showSearchDialog as showSearchDialogService } from './searchService';

import { AutocompleteWidget } from './autocomplete';
import { buildAutocompleteInsertText } from './autocompleteInsertion';
import { showPromptModal } from './promptModal';
import { openModal } from './modalShell';

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

// ─── App State ────────────────────────────────────────────────────────────────

const editorContainer = document.getElementById('editor-container');
const autocompleteContainer = document.getElementById('autocomplete-container');
const statusFile = document.getElementById('status-file');
const statusTime = document.getElementById('status-time');
const currentTimeEl = document.getElementById('current-time');
const loadMoreBtn = document.getElementById('btn-load-more');

const autocomplete = new AutocompleteWidget(autocompleteContainer);

let editors = []; // [{date, view, section}]
let saveTimers = {};
let activeEditorIndex = 0;
let currentNotebook = 'default';
let priorDays = 3;
let loadMoreChunkDays = 3;
let hasMoreOlderDays = true;
let isLoadingOlderDays = false;
let canAutoLoadOlderDays = false;
const loadedDates = new Set();
const AUTO_LOAD_TOP_THRESHOLD_PX = 48;

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function setLoadMoreButtonState() {
  if (!loadMoreBtn) {
    return;
  }

  const chunkLabel = loadMoreChunkDays === 1 ? 'Day' : 'Days';
  if (isLoadingOlderDays) {
    loadMoreBtn.textContent = 'Loading...';
    loadMoreBtn.disabled = true;
    return;
  }

  loadMoreBtn.textContent = `Load ${loadMoreChunkDays} More ${chunkLabel}`;
  loadMoreBtn.disabled = !hasMoreOlderDays;
}

function refreshSearchRegistration() {
  registerAllForSearch(editors.map(({ view, section }) => ({ view, section })));
}

function clearEditors() {
  for (const editor of editors) {
    editor.view.destroy();
  }

  for (const timer of Object.values(saveTimers)) {
    clearTimeout(timer);
  }

  saveTimers = {};
  editors = [];
  loadedDates.clear();
  activeEditorIndex = 0;
  editorContainer.innerHTML = '';
  refreshSearchRegistration();
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

function requestLoadMoreChunkDays() {
  return showPromptModal({
    titleText: 'Load More Chunk Size',
    labelText: 'Days to load per request',
    placeholder: '3',
    initialValue: String(loadMoreChunkDays),
    confirmText: 'Save',
    validate: (value) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return true;
      }
      return 'Enter a positive whole number.';
    }
  });
}

function requestPriorDays() {
  return showPromptModal({
    titleText: 'Initial Prior Days',
    labelText: 'Days to load on startup',
    placeholder: '3',
    initialValue: String(priorDays),
    confirmText: 'Save',
    validate: (value) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return true;
      }
      return 'Enter a positive whole number.';
    }
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
  priorDays = toPositiveInt(config.priorDays, 3);
  loadMoreChunkDays = toPositiveInt(config.loadMoreChunkDays, priorDays);
  currentNotebook = config.currentNotebook || currentNotebook;
  hasMoreOlderDays = true;
  isLoadingOlderDays = false;
  canAutoLoadOlderDays = false;
  setLoadMoreButtonState();

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
    await insertDayEditor(date, { prepend: false, forceCreate: date === today });
  }

  refreshSearchRegistration();

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
    canAutoLoadOlderDays = true;
    setLoadMoreButtonState();
  }, 100);
}

async function insertDayEditor(date, options = {}) {
  const { prepend = false, forceCreate = false } = options;
  if (loadedDates.has(date)) {
    return false;
  }

  let content = await electronAPI.readFile(date);
  if (content === null || content === undefined) {
    if (!forceCreate) {
      return false;
    }
    content = '';
  }

  const section = document.createElement('div');
  section.className = 'day-section';

  const header = document.createElement('div');
  header.className = 'day-header';
  header.textContent = date + (date === todayDate() ? ' (today)' : '');
  section.appendChild(header);

  const editorDiv = document.createElement('div');
  section.appendChild(editorDiv);

  if (prepend) {
    editorContainer.insertBefore(section, editorContainer.firstChild);
  } else {
    editorContainer.appendChild(section);
  }

  const view = createEditor(editorDiv, content, date, date === todayDate());
  const editorRecord = { date, view, section };

  if (prepend) {
    editors.unshift(editorRecord);
    activeEditorIndex += 1;
  } else {
    editors.push(editorRecord);
  }

  loadedDates.add(date);

  if (content) {
    await electronAPI.indexContent(date, content);
  }

  return true;
}

async function loadOlderDays() {
  if (isLoadingOlderDays || !hasMoreOlderDays || editors.length === 0) {
    return;
  }

  const earliestDate = editors[0]?.date;
  if (!earliestDate) {
    return;
  }

  isLoadingOlderDays = true;
  setLoadMoreButtonState();

  try {
    const olderDates = await electronAPI.listOlderDates(earliestDate, loadMoreChunkDays);
    if (!olderDates || olderDates.length === 0) {
      hasMoreOlderDays = false;
      return;
    }

    const oldScrollTop = editorContainer.scrollTop;
    const oldScrollHeight = editorContainer.scrollHeight;

    let insertedCount = 0;
    const datesToInsert = [...olderDates].reverse();
    for (const date of datesToInsert) {
      const inserted = await insertDayEditor(date, { prepend: true, forceCreate: false });
      if (inserted) {
        insertedCount += 1;
      }
    }

    if (insertedCount === 0) {
      hasMoreOlderDays = false;
      return;
    }

    refreshSearchRegistration();

    const newScrollHeight = editorContainer.scrollHeight;
    editorContainer.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
  } finally {
    isLoadingOlderDays = false;
    setLoadMoreButtonState();
  }
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
        // ...searchKeymap, // don't use built-in search keymap to avoid interfering with global search dialog (Ctrl+F)
        {
          key: 'Ctrl-F',
          run: (view) => { showSearchDialogService(); return true; }
        },
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
      trackerSyntax,
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
    const startInLine = start - line.from;
    const insertText = buildAutocompleteInsertText({ lineText, startInLine, type, item });

    view.dispatch({
      changes: { from: start, to: sel.head, insert: insertText },
      selection: { anchor: start + insertText.length }
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

if (loadMoreBtn) {
  loadMoreBtn.addEventListener('click', () => {
    loadOlderDays().catch(console.error);
  });
}

if (editorContainer) {
  editorContainer.addEventListener('scroll', () => {
    if (!canAutoLoadOlderDays || !hasMoreOlderDays || isLoadingOlderDays) {
      return;
    }

    if (editorContainer.scrollTop <= AUTO_LOAD_TOP_THRESHOLD_PX) {
      loadOlderDays().catch(console.error);
    }
  });
}

document.getElementById('sidebar-close').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('hidden');
});

if (electronAPI.onNotebookChanged) {
  electronAPI.onNotebookChanged(async (payload) => {
    currentNotebook = payload.currentNotebook;
    await loadEditors().catch(console.error);
  });
}

if (electronAPI.onCreateNotebookRequested) {
  electronAPI.onCreateNotebookRequested(async () => {
    const enteredName = await requestNotebookName();
    if (!enteredName) return;
    await switchNotebook(enteredName);
  });

  if (electronAPI.onViewDaySourceRequested) {
    electronAPI.onViewDaySourceRequested(async () => {
      const editor = editors[activeEditorIndex];
      if (editor) {
        await electronAPI.openFileNatively(editor.date);
      }
    });
  }

  if (electronAPI.onSetLoadMoreChunkRequested) {
    electronAPI.onSetLoadMoreChunkRequested(async () => {
      const enteredValue = await requestLoadMoreChunkDays();
      if (!enteredValue) return;

      const parsed = toPositiveInt(enteredValue, loadMoreChunkDays);
      const result = await electronAPI.setLoadMoreChunkDays(parsed);
      loadMoreChunkDays = toPositiveInt(result?.loadMoreChunkDays, parsed);
      setLoadMoreButtonState();
    });
  }

  if (electronAPI.onSetPriorDaysRequested) {
    electronAPI.onSetPriorDaysRequested(async () => {
      const enteredValue = await requestPriorDays();
      if (!enteredValue) return;

      const parsed = toPositiveInt(enteredValue, priorDays);
      const result = await electronAPI.setPriorDays(parsed);
      priorDays = toPositiveInt(result?.priorDays, parsed);
      await loadEditors();
    });
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// don't need to call loadEditors as notebook change event will be emitted on initial load