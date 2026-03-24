/**
 * LLM-powered search UI for notebook RAG retrieval.
 * Replaces traditional Ctrl+Shift+F global search.
 * UI is rendered inside the shared sidebarShell.
 */

import { openSidebar } from './sidebarShell';

let llmSearchSession = null;
let sidebarSession = null;

/** Close the currently open sidebar and reset the chat session. */
function closeSidebar() {
  sidebarSession?.close();
}

/**
 * Open the LLM search modal.
 */
export function openLLMSearch(initialScope = 'loaded', getLoadedFiles = () => []) {
  // Check LLM health first
  window.electron.llmChat.checkLLMHealth().then((health) => {
    if (!health.available) {
      showSetup(health.error, health.setupGuide);
    } else {
      showSearch(initialScope, getLoadedFiles);
    }
  });
}

/**
 * Show setup/configuration guidance when LLM is unavailable.
 */
function showSetup(error, setupGuide) {
  sidebarSession = openSidebar({
    titleText: 'LLM Search \u2013 Setup Required',
    extraClass: 'llm-search-sidebar',
    onClose: () => { sidebarSession = null; },
    onOpen: ({ body }) => {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'setup-error';
      errorDiv.textContent = error || 'Local LLM backend is not available.';
      body.appendChild(errorDiv);

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
      body.appendChild(guideDiv);

      const btnDiv = document.createElement('div');
      btnDiv.className = 'actions single';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'secondary';
      closeBtn.textContent = 'Close';
      closeBtn.onclick = () => closeSidebar();
      btnDiv.appendChild(closeBtn);
      body.appendChild(btnDiv);
    },
  });
}

/**
 * Show the main LLM search modal with UI for scope, query, and response.
 */
function showSearch(initialScope, getLoadedFiles) {
  sidebarSession = openSidebar({
    titleText: 'Notebook Search',
    extraClass: 'llm-search-sidebar',
    onClose: () => {
      llmSearchSession = null;
      sidebarSession = null;
    },
    onOpen: ({ body }) => {
      body.classList.add('llm-search-content');

      // Scope selector
      const $scope = document.createElement('div');
      $scope.className = 'scope';

      const $label = document.createElement('label');
      $label.className = 'label inline';
      $label.textContent = 'Search:';

      const $select = document.createElement('select');
      $select.className = 'select';
      $select.innerHTML = `
        <option value="loaded">Currently loaded days</option>
        <option value="full">All notebook history</option>
      `;
      $select.value = initialScope === 'full' ? 'full' : 'loaded';
      $select.addEventListener('change', () => {
        if (llmSearchSession) {
          window.electron.llmChat.closeSession(llmSearchSession).catch(() => {});
          llmSearchSession = null;
        }
      });

      $scope.appendChild($label);
      $scope.appendChild($select);
      body.appendChild($scope);

      // Response area
      const $response = document.createElement('div');
      $response.className = 'response';
      $response.id = 'llm-response';
      body.appendChild($response);

      // Chat actions/composer (bottom)
      const $actions = document.createElement('div');
      $actions.className = 'actions';

      const $input = document.createElement('input');
      $input.type = 'text';
      $input.placeholder = 'Ask something about your notes...';
      $input.className = 'input';
      $actions.appendChild($input);

      const runSearch = () => {
        performLLMSearch($input, $select, $response, getLoadedFiles);
      };

      const $btnSearch = document.createElement('button');
      $btnSearch.className = 'primary icon';

      const $iconSearch = document.createElement('span');
      $iconSearch.className = 'icon-symbol';
      $iconSearch.textContent = '🔎';

    // don't need actual text, use aria-label instead
      // const searchLabel = document.createElement('span');
      // searchLabel.textContent = 'Search';

      $btnSearch.appendChild($iconSearch);
      // searchBtn.appendChild(searchLabel);
      $btnSearch.title = 'Search notes';
      $btnSearch.setAttribute('aria-label', 'Search notes');
      $btnSearch.onclick = runSearch;
      $input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            runSearch();
          }
      });

      $actions.appendChild($btnSearch);
      body.appendChild($actions);

      // Focus input
      $input.focus();
    },
  });
}

/**
 * Perform LLM search and stream response.
 */
async function performLLMSearch(
  $queryInput,
  $scopeSelect,
  $responses,
  getLoadedFiles
) {
  const query = $queryInput.value.trim();
  if (!query) return;

  $responses.classList.remove('is-error');

  const $turn = document.createElement('div');
  $turn.className = 'llm-turn';

  const $question = document.createElement('div');
  $question.className = 'llm-turn-question';
  $question.textContent = `You: ${query}`;

  const $answer = document.createElement('div');
  $answer.className = 'llm-turn-answer';
  $answer.textContent = 'Thinking...';

  const $citations = document.createElement('div');
  $citations.className = 'citations hidden';

  const $citationsLabel = document.createElement('div');
  $citationsLabel.className = 'citations-label';
  $citationsLabel.textContent = 'Sources:';
  $citations.appendChild($citationsLabel);

  const $citationsList = document.createElement('div');
  $citationsList.className = 'citations-list';
  $citations.appendChild($citationsList);

  $turn.appendChild($question);
  $turn.appendChild($answer);
  $turn.appendChild($citations);
  $responses.appendChild($turn);
  $responses.scrollTop = $responses.scrollHeight;

  try {
    // Start session
    if (!llmSearchSession) {
      const sessionResp = await window.electron.llmChat.startSession(
        $scopeSelect.value,
        getLoadedFiles()
      );
      llmSearchSession = sessionResp.sessionId;
    }

    // Stream response via push events (async iterables can't cross Electron IPC)
    await new Promise((resolve, reject) => {
      const removeListener = window.electron.llmChat.onChunk((sessionId, chunk) => {
        if (sessionId !== llmSearchSession) return;

        if (chunk.type === 'start') {
          $answer.textContent = '';
        } else if (chunk.type === 'token') {
          $answer.textContent += chunk.content;
          $responses.scrollTop = $responses.scrollHeight;
        } else if (chunk.type === 'citations') {
          const citations = chunk.citations || [];
          renderCitations($citationsList, citations);
          if (citations.length > 0) {
            $citations.classList.remove('hidden');
          }
          $responses.scrollTop = $responses.scrollHeight;
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

    $queryInput.value = '';
    $queryInput.focus();
  } catch (err) {
    $responses.classList.add('is-error');
    $answer.textContent = `Error: ${err.message}`;
  }
}

/**
 * Render citations as clickable links.
 */
function renderCitations($citationList, citations) {
  $citationList.innerHTML = '';
  for (const cite of citations) {
    const $cite = document.createElement('div');
    $cite.className = 'citation';

    const $date = document.createElement('strong');
    $date.textContent = cite.date;

    const $snippet = document.createElement('span');
    $snippet.className = 'snippet';
    $snippet.textContent = cite.snippet.substring(0, 100) + '...';

    $cite.appendChild($date);
    $cite.appendChild($snippet);

    // Click to focus that day's editor
    $cite.onclick = () => {
      if (window.focusDayEditor) {
        window.focusDayEditor(cite.date);
      }
    };

    $citationList.appendChild($cite);
  }
}

// Export for use in app.js
export { openLLMSearch as default };
