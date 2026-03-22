/**
 * LLM-powered search UI for notebook RAG retrieval.
 * Replaces traditional Ctrl+Shift+F global search.
 */

let llmSearchSession = null;

/**
 * Open the LLM search modal.
 */
export function openLLMSearch() {
  // Check LLM health first
  window.electron.llmChat.checkLLMHealth().then((health) => {
    if (!health.available) {
      showLLMSetupGuidance(health.error, health.setupGuide);
    } else {
      showLLMSearchModal();
    }
  });
}

/**
 * Show setup/configuration guidance when LLM is unavailable.
 */
function showLLMSetupGuidance(error, setupGuide) {
  const modal = createModal('LLM Search – Setup Required');

  const errorDiv = document.createElement('div');
  errorDiv.style.cssText =
    'padding: 12px; background: #fee; border: 1px solid #c00; border-radius: 4px; margin-bottom: 12px; font-size: 12px; color: #c00;';
  errorDiv.textContent = error || 'Local LLM backend is not available.';
  modal.appendChild(errorDiv);

  const guideDiv = document.createElement('div');
  guideDiv.style.cssText = 'font-size: 12px; line-height: 1.6; color: #666;';
  guideDiv.innerHTML = setupGuide || `
    <p><strong>To enable LLM-powered search:</strong></p>
    <ol style="margin: 8px 0; padding-left: 20px;">
      <li>Install and run <a href="https://ollama.ai" target="_blank">Ollama</a></li>
      <li>Pull a model: <code>ollama pull llama2</code></li>
      <li>Start the service: <code>ollama serve</code></li>
      <li>Retry this search</li>
    </ol>
    <p style="margin-top: 12px; font-size: 11px; color: #999;">
      Search defaults to simple keyword matching until backend is available.
    </p>
  `;
  modal.appendChild(guideDiv);

  const btnDiv = document.createElement('div');
  btnDiv.style.cssText = 'margin-top: 16px; text-align: right;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => modal.remove();
  btnDiv.appendChild(closeBtn);
  modal.appendChild(btnDiv);

  document.body.appendChild(modal);
}

/**
 * Show the main LLM search modal with UI for scope, query, and response.
 */
function showLLMSearchModal() {
  const modal = createModal('LLM Notebook Search');

  // Scope selector
  const scopeDiv = document.createElement('div');
  scopeDiv.style.cssText = 'margin-bottom: 12px; display: flex; gap: 12px;';

  const scopeLabel = document.createElement('label');
  scopeLabel.style.cssText = 'font-size: 12px; font-weight: bold; align-self: center;';
  scopeLabel.textContent = 'Search:';

  const scopeSelect = document.createElement('select');
  scopeSelect.style.cssText =
    'padding: 4px 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 3px;';
  scopeSelect.innerHTML = `
    <option value="loaded">Currently loaded days</option>
    <option value="full">All notebook history</option>
  `;

  scopeDiv.appendChild(scopeLabel);
  scopeDiv.appendChild(scopeSelect);
  modal.appendChild(scopeDiv);

  // Query input
  const inputDiv = document.createElement('div');
  inputDiv.style.cssText = 'margin-bottom: 12px;';

  const inputLabel = document.createElement('label');
  inputLabel.style.cssText = 'display: block; font-size: 12px; font-weight: bold; margin-bottom: 4px;';
  inputLabel.textContent = 'Your question:';
  inputDiv.appendChild(inputLabel);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ask something about your notes...';
  input.style.cssText =
    'width: 100%; padding: 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 3px; box-sizing: border-box;';
  inputDiv.appendChild(input);
  modal.appendChild(inputDiv);

  // Response area
  const responseDiv = document.createElement('div');
  responseDiv.style.cssText =
    'margin-bottom: 12px; max-height: 300px; overflow-y: auto; background: #f9f9f9; border: 1px solid #ddd; border-radius: 3px; padding: 12px; font-size: 12px; line-height: 1.5; min-height: 100px;';
  responseDiv.id = 'llm-response';
  responseDiv.textContent = 'Response will appear here...';
  modal.appendChild(responseDiv);

  // Citations
  const citationsDiv = document.createElement('div');
  citationsDiv.style.cssText = 'margin-bottom: 12px; font-size: 11px;';

  const citationsLabel = document.createElement('div');
  citationsLabel.style.cssText = 'font-weight: bold; margin-bottom: 4px; color: #666;';
  citationsLabel.textContent = 'Sources:';
  citationsDiv.appendChild(citationsLabel);

  const citationsList = document.createElement('div');
  citationsList.id = 'llm-citations';
  citationsList.style.cssText = 'padding-left: 12px;';
  citationsDiv.appendChild(citationsList);
  modal.appendChild(citationsDiv);

  // Follow-up input (hidden initially)
  const followupDiv = document.createElement('div');
  followupDiv.style.cssText =
    'margin-bottom: 12px; display: none; border-top: 1px solid #ddd; padding-top: 12px;';
  followupDiv.id = 'llm-followup';

  const followupLabel = document.createElement('label');
  followupLabel.style.cssText = 'display: block; font-size: 12px; font-weight: bold; margin-bottom: 4px;';
  followupLabel.textContent = 'Follow-up question:';
  followupDiv.appendChild(followupLabel);

  const followupInput = document.createElement('input');
  followupInput.type = 'text';
  followupInput.placeholder = 'Ask a follow-up question...';
  followupInput.style.cssText =
    'width: 100%; padding: 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 3px; box-sizing: border-box;';
  followupDiv.appendChild(followupInput);

  modal.appendChild(followupDiv);

  // Buttons
  const btnDiv = document.createElement('div');
  btnDiv.style.cssText =
    'display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #ddd; padding-top: 12px;';

  const searchBtn = document.createElement('button');
  searchBtn.textContent = 'Search';
  searchBtn.style.cssText =
    'padding: 6px 12px; font-size: 12px; background: #007acc; color: white; border: none; border-radius: 3px; cursor: pointer;';
  searchBtn.onclick = () => performLLMSearch(input, scopeSelect, responseDiv, citationsList, followupDiv);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'padding: 6px 12px; font-size: 12px; background: #e0e0e0; border: none; border-radius: 3px; cursor: pointer;';
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
  citationsList.innerHTML = '';

  try {
    // Start session
    if (!llmSearchSession) {
      const sessionResp = await window.electron.llmChat.startSession(
        scopeSelect.value
      );
      llmSearchSession = sessionResp.sessionId;
    }

    // Stream response
    responseDiv.textContent = '';
    let citations = [];

    const stream = await window.electron.llmChat.sendMessage(
      llmSearchSession,
      query
    );

    for await (const chunk of stream) {
      if (chunk.type === 'token') {
        responseDiv.textContent += chunk.content;
      } else if (chunk.type === 'citations') {
        citations = chunk.citations || [];
        renderCitations(citationsList, citations);
      }
    }

    // Show follow-up input
    followupDiv.style.display = 'block';
  } catch (err) {
    responseDiv.style.color = '#c00';
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
    citeElem.style.cssText =
      'margin-bottom: 4px; padding: 4px; background: #eef; border-left: 3px solid #007acc; cursor: pointer; border-radius: 2px;';

    const dateSpan = document.createElement('strong');
    dateSpan.textContent = cite.date;

    const snippetSpan = document.createElement('span');
    snippetSpan.style.cssText = 'display: block; margin-top: 2px; color: #666; font-size: 11px;';
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
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    max-height: 600px;
    overflow-y: auto;
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  `;

  const titleElem = document.createElement('h2');
  titleElem.style.cssText = 'margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #333;';
  titleElem.textContent = title;
  modal.appendChild(titleElem);

  return modal;
}

// Export for use in app.js
export { openLLMSearch as default };
