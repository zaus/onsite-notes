/**
 * LLM-powered search UI for notebook RAG retrieval.
 * Replaces traditional Ctrl+Shift+F global search.
 */

let llmSearchSession = null;

/**
 * Open the LLM search modal.
 */
export function openLLMSearch(initialScope = 'loaded') {
  // Check LLM health first
  window.electron.llmChat.checkLLMHealth().then((health) => {
    if (!health.available) {
      showLLMSetupGuidance(health.error, health.setupGuide);
    } else {
      showLLMSearchModal(initialScope);
    }
  });
}

/**
 * Show setup/configuration guidance when LLM is unavailable.
 */
function showLLMSetupGuidance(error, setupGuide) {
  const modal = createModal('LLM Search – Setup Required');

  const errorDiv = document.createElement('div');
  errorDiv.className = 'setup-error';
  errorDiv.textContent = error || 'Local LLM backend is not available.';
  modal.appendChild(errorDiv);

  const guideDiv = document.createElement('div');
  guideDiv.className = 'setup-guide';
  guideDiv.innerHTML = setupGuide || `
    <p><strong>To enable LLM-powered search:</strong></p>
    <ol>
      <li>Install and run <a href="https://ollama.ai" target="_blank">Ollama</a></li>
      <li>Pull a model: <code>ollama pull llama2</code></li>
      <li>Start the service: <code>ollama serve</code></li>
      <li>Retry this search</li>
    </ol>
    <p class="note">Model/provider changes apply on your next message in the current chat session.</p>
    <p class="fallback">
      Search defaults to simple keyword matching until backend is available.
    </p>
  `;
  modal.appendChild(guideDiv);

  const btnDiv = document.createElement('div');
  btnDiv.className = 'actions single';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn secondary';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => modal.remove();
  btnDiv.appendChild(closeBtn);
  modal.appendChild(btnDiv);

  document.body.appendChild(modal);
}

/**
 * Show the main LLM search modal with UI for scope, query, and response.
 */
function showLLMSearchModal(initialScope) {
  const modal = createModal('LLM Notebook Search');

  // Scope selector
  const scopeDiv = document.createElement('div');
  scopeDiv.className = 'scope';

  const scopeLabel = document.createElement('label');
  scopeLabel.className = 'label inline';
  scopeLabel.textContent = 'Search:';

  const scopeSelect = document.createElement('select');
  scopeSelect.className = 'select';
  scopeSelect.innerHTML = `
    <option value="loaded">Currently loaded days</option>
    <option value="full">All notebook history</option>
  `;
  scopeSelect.value = initialScope === 'full' ? 'full' : 'loaded';

  scopeDiv.appendChild(scopeLabel);
  scopeDiv.appendChild(scopeSelect);
  modal.appendChild(scopeDiv);

  // Query input
  const inputDiv = document.createElement('div');
  inputDiv.className = 'input-group';

  const inputLabel = document.createElement('label');
  inputLabel.className = 'label';
  inputLabel.textContent = 'Your question:';
  inputDiv.appendChild(inputLabel);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ask something about your notes...';
  input.className = 'input';
  inputDiv.appendChild(input);
  modal.appendChild(inputDiv);

  // Response area
  const responseDiv = document.createElement('div');
  responseDiv.className = 'response';
  responseDiv.id = 'llm-response';
  responseDiv.textContent = 'Response will appear here...';
  modal.appendChild(responseDiv);

  // Citations
  const citationsDiv = document.createElement('div');
  citationsDiv.className = 'citations';

  const citationsLabel = document.createElement('div');
  citationsLabel.className = 'citations-label';
  citationsLabel.textContent = 'Sources:';
  citationsDiv.appendChild(citationsLabel);

  const citationsList = document.createElement('div');
  citationsList.id = 'llm-citations';
  citationsList.className = 'citations-list';
  citationsDiv.appendChild(citationsList);
  modal.appendChild(citationsDiv);

  // Follow-up input (hidden initially)
  const followupDiv = document.createElement('div');
  followupDiv.className = 'followup';
  followupDiv.id = 'llm-followup';

  const followupLabel = document.createElement('label');
  followupLabel.className = 'label';
  followupLabel.textContent = 'Follow-up question:';
  followupDiv.appendChild(followupLabel);

  const followupInput = document.createElement('input');
  followupInput.type = 'text';
  followupInput.placeholder = 'Ask a follow-up question...';
  followupInput.className = 'input';
  followupDiv.appendChild(followupInput);

  modal.appendChild(followupDiv);

  // Buttons
  const btnDiv = document.createElement('div');
  btnDiv.className = 'actions';

  const searchBtn = document.createElement('button');
  searchBtn.textContent = 'Search';
  searchBtn.className = 'btn primary';
  searchBtn.onclick = () => performLLMSearch(input, scopeSelect, responseDiv, citationsList, followupDiv);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.className = 'btn secondary';
  closeBtn.onclick = () => modal.remove();

  btnDiv.appendChild(searchBtn);
  btnDiv.appendChild(closeBtn);
  modal.appendChild(btnDiv);

  document.body.appendChild(modal);

  // Focus input
  input.focus();
}

/**
 * Perform LLM search and stream response.
 */
async function performLLMSearch(
  queryInput,
  scopeSelect,
  responseDiv,
  citationsList,
  followupDiv
) {
  const query = queryInput.value.trim();
  if (!query) return;

  responseDiv.textContent = 'Thinking...';
  responseDiv.classList.remove('is-error');
  citationsList.innerHTML = '';

  try {
    // Start session
    if (!llmSearchSession) {
      const sessionResp = await window.electron.llmChat.startSession(
        scopeSelect.value
      );
      llmSearchSession = sessionResp.sessionId;
    }

    // Stream response via push events (async iterables can't cross Electron IPC)
    responseDiv.textContent = '';

    await new Promise((resolve, reject) => {
      const removeListener = window.electron.llmChat.onChunk((sessionId, chunk) => {
        if (sessionId !== llmSearchSession) return;

        if (chunk.type === 'token') {
          responseDiv.textContent += chunk.content;
        } else if (chunk.type === 'citations') {
          renderCitations(citationsList, chunk.citations || []);
        } else if (chunk.type === 'done') {
          removeListener();
          resolve();
        } else if (chunk.type === 'error') {
          removeListener();
          reject(new Error(chunk.content));
        }
      });

      // Start the stream (push events will arrive via onChunk)
      window.electron.llmChat.sendMessage(llmSearchSession, query).catch((err) => {
        removeListener();
        reject(err);
      });
    });

    // Show follow-up input
    followupDiv.classList.add('is-visible');
  } catch (err) {
    responseDiv.classList.add('is-error');
    responseDiv.textContent = `Error: ${err.message}`;
  }
}

/**
 * Render citations as clickable links.
 */
function renderCitations(citationsList, citations) {
  citationsList.innerHTML = '';
  for (const cite of citations) {
    const citeElem = document.createElement('div');
    citeElem.className = 'citation';

    const dateSpan = document.createElement('strong');
    dateSpan.textContent = cite.date;

    const snippetSpan = document.createElement('span');
    snippetSpan.className = 'snippet';
    snippetSpan.textContent = cite.snippet.substring(0, 100) + '...';

    citeElem.appendChild(dateSpan);
    citeElem.appendChild(snippetSpan);

    // Click to focus that day's editor
    citeElem.onclick = () => {
      if (window.focusDayEditor) {
        window.focusDayEditor(cite.date);
      }
    };

    citationsList.appendChild(citeElem);
  }
}

/**
 * Create a styled modal container.
 */
function createModal(title) {
  const modal = document.createElement('div');
  modal.className = 'llm-search-modal';

  const titleElem = document.createElement('h2');
  titleElem.className = 'title';
  titleElem.textContent = title;
  modal.appendChild(titleElem);

  return modal;
}

// Export for use in app.js
export { openLLMSearch as default };
