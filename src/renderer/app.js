import { EditorState, EditorSelection, Prec } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history, insertNewlineAndIndent } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';

// custom language for tracker syntax highlighting
import { trackerSyntax } from './language-tracker';
import { toPositiveInt, toUnitIntervalNumber } from '../main/utilities';

// native CTRL+F for single editor
import { searchKeymap } from '@codemirror/search';
// global search service for searching across all editors and managing the search dialog state
import { registerAllForSearch, showSearchDialog as showSearchDialogService } from './searchService';

// LLM-powered search
import { openLLMSearch } from './llmSearch';

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

const $editorContainer = document.getElementById('editor-container');
const $autocompleteContainer = document.getElementById('autocomplete-container');
const $statusFile = document.getElementById('status-file');
const $statusTime = document.getElementById('status-time');
const $currentTime = document.getElementById('current-time');
const $btnTimestamp = document.getElementById('btn-timestamp');
const $btnEndDay = document.getElementById('btn-endday');
const $btnAnalysis = document.getElementById('btn-analysis');
const $btnSearch = document.getElementById('btn-search');
const $btnPrevEditor = document.getElementById('btn-prev-editor');
const $btnNextEditor = document.getElementById('btn-next-editor');
const $btnEditorEnd = document.getElementById('btn-editor-end');
const $btnLoadMore = document.getElementById('btn-load-more');
const $btnSidebarClose = document.getElementById('sidebar-close');

const autocomplete = new AutocompleteWidget($autocompleteContainer);

// state
let editors = []; // [{date, view, section}]
let saveTimers = {};
let activeEditorIndex = 0;
let currentNotebook = 'default';
let hasMoreOlderDays = true;
let isLoadingOlderDays = false;
let canAutoLoadOlderDays = false;
const loadedDates = new Set();
const AUTO_LOAD_TOP_THRESHOLD_PX = 48;

function setLoadMoreButtonState(loadMoreDays) {
  const chunkLabel = loadMoreDays === 1 ? 'Day' : 'Days';
  if (isLoadingOlderDays) {
    $btnLoadMore.textContent = 'Loading...';
    $btnLoadMore.disabled = true;
    return;
  }

  $btnLoadMore.textContent = `Load ${loadMoreDays} More ${chunkLabel}`;
  $btnLoadMore.disabled = !hasMoreOlderDays;
}

function refreshSearchRegistration() {
  registerAllForSearch(editors.map(({ view, section }) => ({ view, section })));
}

function focusEditorAtIndex(index) {
  if (index === null || index === undefined) index = editors.length - 1;

  const editor = editors[index];
  if (!editor) {
    return false;
  }

  activeEditorIndex = index;
  editor.section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  editor.view.focus();
  $statusFile.textContent = editor.date + '.txt';
  return true;
}

function findEditorIndexByDate(date) {
  return editors.findIndex((editor) => editor.date === date);
}

function findCitationRange(docText, snippet) {
  const normalizedSnippet = String(snippet || '')
    .replace(/^\.\.\./, '')
    .replace(/\.\.\.$/, '')
    .trim();

  if (!normalizedSnippet) {
    return null;
  }

  const candidates = [normalizedSnippet];
  const linesByLength = normalizedSnippet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  if (linesByLength[0] && !candidates.includes(linesByLength[0])) {
    candidates.push(linesByLength[0]);
  }

  const collapsedWhitespace = normalizedSnippet.replace(/\s+/g, ' ').trim();
  if (collapsedWhitespace && !candidates.includes(collapsedWhitespace)) {
    candidates.push(collapsedWhitespace);
  }

  for (const candidate of candidates) {
    const start = docText.indexOf(candidate);
    if (start !== -1) {
      return {
        from: start,
        to: start + candidate.length,
      };
    }
  }

  return null;
}

async function ensureEditorLoaded(date) {
  const existingIndex = findEditorIndexByDate(date);
  if (existingIndex !== -1) {
    return existingIndex;
  }

  const insertAtIndex = editors.findIndex((editor) => editor.date > date);
  const inserted = await insertDayEditor(date, {
    forceCreate: false,
    insertAtIndex: insertAtIndex === -1 ? editors.length : insertAtIndex,
  });

  if (!inserted) {
    return -1;
  }

  refreshSearchRegistration();
  return findEditorIndexByDate(date);
}

async function focusDayEditor(date, snippet = '') {
  const editorIndex = await ensureEditorLoaded(date);
  if (editorIndex === -1) {
    return false;
  }

  focusEditorAtIndex(editorIndex);

  const editor = editors[editorIndex];
  if (!editor) {
    return false;
  }

  const matchRange = findCitationRange(editor.view.state.doc.toString(), snippet);
  if (matchRange) {
    editor.view.dispatch({
      selection: EditorSelection.range(matchRange.from, matchRange.to),
      scrollIntoView: true,
    });
  }

  editor.view.focus();
  return true;
}

function jumpToEditorEnd(view) {
  if (view === null || view === undefined) {
    focusEditorAtIndex();
    view = editors[activeEditorIndex].view;
  }
  const endPosition = view.state.doc.length;

  view.dispatch({
    selection: { anchor: endPosition },
    scrollIntoView: true
  });
  view.focus();
  return true;
}

function focusAdjacentEditor(offset) {
  if (editors.length === 0) {
    return false;
  }

  const targetIndex = activeEditorIndex + offset;
  if (targetIndex < 0 || targetIndex >= editors.length) {
    return false;
  }

  return focusEditorAtIndex(targetIndex);
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
  $editorContainer.innerHTML = '';
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

async function requestAppSettingValue(settingKey) {
  const config = await electronAPI.getConfig();

  if (settingKey === 'loadMoreDays') {
    return showPromptModal({
      titleText: 'Load More Days',
      labelText: 'Days to load per request',
      placeholder: '3',
      initialValue: String(config.loadMoreDays),
      confirmText: 'Save',
      validate: (value) => toPositiveInt(value) !== null || 'Enter a positive whole number.'
    });
  }

  if (settingKey === 'priorDays') {
    return showPromptModal({
      titleText: 'Initial Prior Days',
      labelText: 'Days to load on startup',
      placeholder: '3',
      initialValue: String(config.priorDays),
      confirmText: 'Save',
      validate: (value) => toPositiveInt(value) !== null || 'Enter a positive whole number.'
    });
  }

  if (settingKey === 'llmProvider') {
    return showPromptModal({
      titleText: 'LLM Provider',
      labelText: 'Provider name',
      placeholder: 'ollama',
      initialValue: String(config.llmProvider),
      confirmText: 'Save',
      validate: (value) => value.trim().toLowerCase() === 'ollama' || 'Only "ollama" is currently supported.'
    });
  }

  if (settingKey === 'llmBaseUrl') {
    return showPromptModal({
      titleText: 'LLM Base URL',
      labelText: 'Base URL for the LLM service',
      placeholder: 'http://localhost:11434',
      initialValue: String(config.llmBaseUrl),
      confirmText: 'Save',
      validate: (value) => value.trim().length > 0 || 'Base URL is required.'
    });
  }

  if (settingKey === 'llmModel') {
    return showPromptModal({
      titleText: 'LLM Model',
      labelText: 'Model name',
      placeholder: 'llama3.2',
      initialValue: String(config.llmModel),
      confirmText: 'Save',
      validate: (value) => value.trim().length > 0 || 'Model is required.'
    });
  }

  if (settingKey === 'llmEmbeddingModel') {
    return showPromptModal({
      titleText: 'LLM Embedding Model',
      labelText: 'Embedding model name',
      placeholder: 'nomic-embed-text',
      initialValue: String(config.llmEmbeddingModel || 'nomic-embed-text'),
      confirmText: 'Save',
      validate: (value) => value.trim().length > 0 || 'Embedding model is required.'
    });
  }

  if (settingKey === 'llmSearchScope') {
    return showPromptModal({
      titleText: 'LLM Search Scope',
      labelText: 'Default scope (loaded or full)',
      placeholder: 'loaded',
      initialValue: String(config.llmSearchScope),
      confirmText: 'Save',
      validate: (value) => {
        const normalized = value.trim().toLowerCase();
        return normalized === 'loaded' || normalized === 'full' || 'Enter either "loaded" or "full".';
      }
    });
  }

  if (settingKey === 'llmContextBefore') {
    return showPromptModal({
      titleText: 'LLM Context Before',
      labelText: 'Characters to include before a match',
      placeholder: '150',
      initialValue: String(config.llmContextBefore),
      confirmText: 'Save',
      validate: (value) => toPositiveInt(value) !== null || 'Enter a positive whole number.'
    });
  }

  if (settingKey === 'llmContextAfter') {
    return showPromptModal({
      titleText: 'LLM Context After',
      labelText: 'Characters to include after a match',
      placeholder: '300',
      initialValue: String(config.llmContextAfter),
      confirmText: 'Save',
      validate: (value) => toPositiveInt(value) !== null || 'Enter a positive whole number.'
    });
  }

  if (settingKey === 'llmCitationMinScore') {
    return showPromptModal({
      titleText: 'LLM Citation Min Score',
      labelText: 'Minimum citation score (0 to 1)',
      placeholder: '0.45',
      initialValue: String(config.llmCitationMinScore ?? 0.45),
      confirmText: 'Save',
      validate: (value) => toUnitIntervalNumber(value) !== null || 'Enter a number from 0 to 1.'
    });
  }

  return null;
}

function updateTime() {
  const { time, date } = getNow();
  const display = `${time} ${date}`;
  if ($currentTime) $currentTime.textContent = display;
  if ($statusTime) $statusTime.textContent = display;
}
setInterval(updateTime, 1000);
updateTime();

async function loadEditors() {
  const config = await electronAPI.getConfig();
  currentNotebook = config.currentNotebook || currentNotebook;
  hasMoreOlderDays = true;
  isLoadingOlderDays = false;
  canAutoLoadOlderDays = false;
  setLoadMoreButtonState(config.loadMoreDays);

  const today = todayDate();

  const dates = [];
  for (let i = config.priorDays; i >= 0; i--) {
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
    focusEditorAtIndex(editors.length - 1);
  }

  // Scroll to bottom of today
  setTimeout(() => {
    const last = editors[editors.length - 1];
    if (last) {
      last.section.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    canAutoLoadOlderDays = true;
    setLoadMoreButtonState(config.loadMoreDays);
  }, 100);
}

async function insertDayEditor(date, options = {}) {
  const { prepend = false, forceCreate = false, insertAtIndex = null } = options;
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

  const $section = document.createElement('div');
  $section.className = 'day-section';

  const $header = document.createElement('div');
  $header.className = 'day-header';
  $header.textContent = date + (date === todayDate() ? ' (today)' : '');
  $section.appendChild($header);

  const $editorDiv = document.createElement('div');
  $section.appendChild($editorDiv);

  const shouldInsertAtIndex = Number.isInteger(insertAtIndex) && insertAtIndex >= 0 && insertAtIndex < $editorContainer.children.length;

  if (shouldInsertAtIndex) {
    $editorContainer.insertBefore($section, $editorContainer.children[insertAtIndex]);
  } else if (prepend) {
    $editorContainer.insertBefore($section, $editorContainer.firstChild);
  } else {
    $editorContainer.appendChild($section);
  }

  const view = createEditor($editorDiv, content, date, date === todayDate());
  const editorRecord = { date, view, section: $section };

  if (shouldInsertAtIndex) {
    editors.splice(insertAtIndex, 0, editorRecord);
    if (insertAtIndex <= activeEditorIndex) {
      activeEditorIndex += 1;
    }
  } else if (prepend) {
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
  const config = await electronAPI.getConfig();
  setLoadMoreButtonState(config.loadMoreDays);

  try {
    const olderDates = await electronAPI.listOlderDates(earliestDate, config.loadMoreDays);
    if (!olderDates || olderDates.length === 0) {
      hasMoreOlderDays = false;
      return;
    }

    const oldScrollTop = $editorContainer.scrollTop;
    const oldScrollHeight = $editorContainer.scrollHeight;

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

    const newScrollHeight = $editorContainer.scrollHeight;
    $editorContainer.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
  } finally {
    isLoadingOlderDays = false;
    setLoadMoreButtonState(config.loadMoreDays);
  }
}

async function openLLMSearchWithConfiguredScope() {
  const config = await electronAPI.getConfig();
  openLLMSearch(config.llmSearchScope, () => editors.map(({ date }) => `${date}.txt`));
}

function createEditor(container, content, date, isToday) {
  const saveDoc = async (docContent) => {
    await electronAPI.writeFile(date, docContent);
    await electronAPI.indexContent(date, docContent);
  };

  // takes precedence over native keymaps
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

  // takes precedence over native keymaps
  const superSearchKeymap = Prec.highest(keymap.of([
    {
      key: 'Ctrl-Shift-F | F3',
      run: () => {
        openLLMSearchWithConfiguredScope().catch(console.error);
        return true;
      }
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
      superSearchKeymap,
      indentUnit.of('\t'),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap, // or should we just use global search always?
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
          key: 'Ctrl-ArrowDown',
          run: () => focusAdjacentEditor(1)
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
          key: 'Ctrl-ArrowUp',
          run: () => focusAdjacentEditor(-1)
        },
        {
          key: 'Ctrl-F7', // basically 'ctrl-end' but automatically to last editor too
          run: () => jumpToEditorEnd()
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
            $statusFile.textContent = editors[activeEditorIndex].date + '.txt';
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
  const ts = `${time} ${nowDate}\tdone\n`; // now that each day is a separate editor/file, don't need the visual separator line `---------------------\n`
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

  const $sidebar = document.getElementById('sidebar');
  const $sidebarTitle = document.getElementById('sidebar-title');
  const $sidebarContent = document.getElementById('sidebar-content');

  $sidebarTitle.textContent = found;
  $sidebarContent.innerHTML = 'Loading...';
  $sidebar.classList.remove('hidden');

  $sidebarContent.innerHTML = `<div class="sidebar-link"><div class="link-context">Ctrl+click detected: ${found}</div><div class="link-date">Use analysis (F1) to see all references</div></div>`;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

function showAnalysis() {
  const $template = document.getElementById('analysis-modal-template');
  const $content = $template?.content?.cloneNode(true);
  if (!$content) return;

  const $rangeRadios = $content.querySelectorAll('input[name="analysis-range"]');
  const $formatRadios = $content.querySelectorAll('input[name="analysis-format"]');
  const $customRange = $content.querySelector('#custom-range');
  const $rangeStartInput = $content.querySelector('#range-start');
  const $rangeEndInput = $content.querySelector('#range-end');
  const $analysisOutput = $content.querySelector('#analysis-output');
  if (!$customRange || !$rangeStartInput || !$rangeEndInput || !$analysisOutput || $rangeRadios.length === 0 || $formatRadios.length === 0) return;

  $analysisOutput.addEventListener('dblclick', (event) => {
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents($analysisOutput);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  $rangeRadios.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      $customRange.classList.toggle('hidden', event.target.value !== 'custom');
    });
  });

  openModal({
    titleText: 'Analysis',
    content: $content,
    confirmText: 'Run',
    cancelText: 'Close',
    onConfirm: async () => {
      const $selectedRange = Array.from($rangeRadios).find((radio) => radio.checked);
      const $selectedFormat = Array.from($formatRadios).find((radio) => radio.checked);
      if (!$selectedRange || !$selectedFormat) return false;

      const range = $selectedRange.value;
      const format = $selectedFormat.value;
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
        startDate = $rangeStartInput.value;
        endDate = $rangeEndInput.value;
        if (!startDate || !endDate) {
          $analysisOutput.textContent = 'Please select a date range.';
          return false;
        }
      }

      $analysisOutput.textContent = 'Running analysis...';
      const result = await electronAPI.analyze(startDate, endDate, format);
      if (format === 'html') {
        $analysisOutput.classList.remove('text');
        $analysisOutput.innerHTML = result;
      } else {
        $analysisOutput.classList.add('text');
        $analysisOutput.textContent = result;
      }

      return false;
    }
  });
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

$btnTimestamp.addEventListener('click', () => {
  if (editors[activeEditorIndex]) {
    insertTimestamp(editors[activeEditorIndex].view, editors[activeEditorIndex].date);
  }
});

$btnEndDay.addEventListener('click', () => {
  if (editors[activeEditorIndex]) {
    insertEndDay(editors[activeEditorIndex].view, editors[activeEditorIndex].date);
  }
});

$btnAnalysis.addEventListener('click', showAnalysis);

$btnSearch.addEventListener('click', () => {
  openLLMSearchWithConfiguredScope().catch(console.error);
});

$btnPrevEditor.addEventListener('click', () => {
  focusAdjacentEditor(-1);
});

$btnNextEditor.addEventListener('click', () => {
  focusAdjacentEditor(1);
});

$btnEditorEnd.addEventListener('click', () => {
  jumpToEditorEnd();
});

$btnLoadMore.addEventListener('click', () => {
  loadOlderDays().catch(console.error);
});

$editorContainer.addEventListener('scroll', () => {
  if (!canAutoLoadOlderDays || !hasMoreOlderDays || isLoadingOlderDays) {
    return;
  }

  if ($editorContainer.scrollTop <= AUTO_LOAD_TOP_THRESHOLD_PX) {
    loadOlderDays().catch(console.error);
  }
});

$btnSidebarClose.addEventListener('click', () => {
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

  if (electronAPI.onAppSettingRequested) {
    electronAPI.onAppSettingRequested(async (settingKey) => {
      const enteredValue = await requestAppSettingValue(settingKey);
      if (!enteredValue) return;

      await electronAPI.setAppSetting(settingKey, enteredValue);

      if (settingKey === 'loadMoreDays') {
        const config = await electronAPI.getConfig();
        setLoadMoreButtonState(config.loadMoreDays);
      }
    });
  }
}

window.focusDayEditor = focusDayEditor;

// ─── Init ─────────────────────────────────────────────────────────────────────

// don't need to call loadEditors as notebook change event will be emitted on initial load