import { EditorSelection } from '@codemirror/state';

let globalSearchState = {
  query: '',
  results: [], // [{editorIndex, pos, endPos}]
  currentResultIndex: 0,
  dialog: null
};

let editorsRef = []; // This will hold references to all editor instances for searching];

export function registerAllForSearch(editors) {
  editorsRef = editors;
}

export function registerForSearch(editorView) {
  editorsRef.push({ view: editorView, section: editorView.dom.parentElement });
}

export function searchAllEditors(query) {
  globalSearchState.query = query;
  globalSearchState.results = [];
  globalSearchState.currentResultIndex = 0;

  if (!query || !editorsRef) return;

  const queryRegex = new RegExp(query, 'gi');

  for (let editorIndex = 0; editorIndex < editorsRef.length; editorIndex++) {
    const editor = editorsRef[editorIndex];
    const text = editor.view.state.doc.toString();
    let match;

    // Reset regex state for global flag
    queryRegex.lastIndex = 0;

    while ((match = queryRegex.exec(text)) !== null) {
      globalSearchState.results.push({
        editorIndex,
        pos: match.index,
        endPos: match.index + match[0].length
      });
    }
  }
}

export function goToNextSearchResult() {
  if (globalSearchState.results.length === 0 || !editorsRef) return;

  const result = globalSearchState.results[globalSearchState.currentResultIndex];
  const editor = editorsRef[result.editorIndex];

  // Scroll section into view
  editor.section.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Focus the editor and select the match
  editor.view.focus();
  editor.view.dispatch({
    selection: EditorSelection.range(result.pos, result.endPos),
    scrollIntoView: true
  });

  // Move to next result for subsequent presses
  globalSearchState.currentResultIndex = (globalSearchState.currentResultIndex + 1) % globalSearchState.results.length;
}

export function goToPreviousSearchResult() {
  if (globalSearchState.results.length === 0 || !editorsRef) return;

  globalSearchState.currentResultIndex = (globalSearchState.currentResultIndex - 1 + globalSearchState.results.length) % globalSearchState.results.length;
  const result = globalSearchState.results[globalSearchState.currentResultIndex];
  const editor = editorsRef[result.editorIndex];

  // Scroll section into view
  editor.section.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Focus the editor and select the match
  editor.view.focus();
  editor.view.dispatch({
    selection: EditorSelection.range(result.pos, result.endPos),
    scrollIntoView: true
  });
}

export function showSearchDialog() {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #2d2d2d;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 10px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search all editors...';
  input.style.cssText = `
    background: #1e1e1e;
    color: #d4d4d4;
    border: 1px solid #444;
    padding: 6px 8px;
    border-radius: 3px;
    font-family: 'DejaVu Sans Mono', 'Courier New', monospace;
    width: 250px;
    margin-right: 8px;
  `;

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '↓';
  nextBtn.title = 'Next result (Enter)';
  nextBtn.style.cssText = `
    background: #0e639c;
    color: #fff;
    border: none;
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
    margin-right: 4px;
  `;

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '↑';
  prevBtn.title = 'Previous result (Shift+Enter)';
  prevBtn.style.cssText = `
    background: #0e639c;
    color: #fff;
    border: none;
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
    margin-right: 4px;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close (Escape)';
  closeBtn.style.cssText = `
    background: #545454;
    color: #fff;
    border: none;
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
  `;

  const infoSpan = document.createElement('span');
  infoSpan.style.cssText = `
    color: #858585;
    font-size: 12px;
    margin-left: 8px;
    display: inline-block;
    min-width: 60px;
  `;

  const updateInfo = () => {
    const total = globalSearchState.results.length;
    const current = total > 0 ? globalSearchState.currentResultIndex + 1 : 0;
    infoSpan.textContent = total > 0 ? `${current}/${total}` : 'No matches';
  };

  input.addEventListener('input', (e) => {
    searchAllEditors(e.target.value);
    globalSearchState.currentResultIndex = 0;
    updateInfo();
    if (globalSearchState.results.length > 0) {
      goToNextSearchResult();
    }
  });

  nextBtn.addEventListener('click', goToNextSearchResult);
  prevBtn.addEventListener('click', goToPreviousSearchResult);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        goToPreviousSearchResult();
      } else {
        goToNextSearchResult();
      }
    } else if (e.key === 'Escape') {
      closeSearchDialog();
    }
  });

  closeBtn.addEventListener('click', closeSearchDialog);

  dialog.appendChild(input);
  dialog.appendChild(nextBtn);
  dialog.appendChild(prevBtn);
  dialog.appendChild(closeBtn);
  dialog.appendChild(infoSpan);

  document.body.appendChild(dialog);
  globalSearchState.dialog = dialog;
  input.focus();
  updateInfo();
}

export function closeSearchDialog() {
  if (globalSearchState.dialog) {
    globalSearchState.dialog.remove();
    globalSearchState.dialog = null;
    globalSearchState.query = '';
    globalSearchState.results = [];
  }
}
