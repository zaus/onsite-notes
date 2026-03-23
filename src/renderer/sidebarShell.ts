/**
 * Generic docked right-side sidebar shell.
 *
 * Pattern mirrors modalShell.ts:
 *   - Sidebar elements are read from predefined index.html markup and reused.
 *   - openSidebar() accepts options, populates the title, and returns a SidebarSession
 *     whose `body` element callers fill with content.
 *   - Any previously open session is closed before a new one opens.
 *   - Escape closes the sidebar.
 *   - The left edge is draggable to resize the width.
 */

export type SidebarOpenContext = {
  /** The scrollable content area – append your UI here. */
  body: HTMLElement;
};

export type SidebarOpenOptions = {
  /** Heading shown at the top of the sidebar. */
  titleText?: string;
  /** Initial pixel width (default: 360). Respects CSS min/max constraints. */
  initialWidth?: number;
  /**
   * Extra CSS class added to the sidebar root for per-consumer styling.
   * E.g. 'llm-search-sidebar' lets llmSearch.css scope its content styles.
   */
  extraClass?: string;
  /** Called after the sidebar is visible. Use to focus an input, etc. */
  onOpen?: (context: SidebarOpenContext) => void;
  /** Called whenever the sidebar is closed (by any means). */
  onClose?: () => void;
};

export type SidebarSession = {
  close: () => void;
};

// ── Single shared element ────────────────────────────────────────────────────

type SidebarElements = {
  shell: HTMLElement;
  resizeHandle: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  closeButton: HTMLButtonElement;
};

let shellElements: SidebarElements | null = null;
let activeSession: SidebarSession | null = null;

function getShellElements(): SidebarElements | null {
  if (shellElements) return shellElements;

  const shell = document.getElementById('sidebar');
  const resizeHandle = document.getElementById('sidebar-resize');
  const title = document.getElementById('sidebar-title');
  const body = document.getElementById('sidebar-content');
  const closeButton = document.getElementById('sidebar-close');

  if (!shell || !resizeHandle || !title || !body || !closeButton) {
    return null;
  }

  // ── Drag-to-resize logic ─────────────────────────────────────────────────
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = shell.offsetWidth;
    resizeHandle.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = startX - e.clientX;
    const newWidth = Math.max(200, Math.min(window.innerWidth * 0.8, startWidth + delta));
    shell.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    resizeHandle.classList.remove('is-dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });

  closeButton.addEventListener('click', () => {
    if (activeSession) {
      activeSession.close();
    }
  });

  shellElements = {
    shell,
    resizeHandle,
    title,
    body,
    closeButton: closeButton as HTMLButtonElement,
  };
  return shellElements;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function openSidebar(options: SidebarOpenOptions = {}): SidebarSession {
  const {
    titleText = '',
    initialWidth,
    extraClass,
    onOpen,
    onClose,
  } = options;

  // Close any existing session first
  if (activeSession) {
    activeSession.close();
  }

  const elements = getShellElements();
  if (!elements) {
    return { close: () => {} };
  }

  const { shell, title, body } = elements;
  if (extraClass) {
    shell.classList.add(extraClass);
  }

  if (initialWidth) {
    shell.style.width = initialWidth + 'px';
  }

  title.textContent = titleText;
  body.innerHTML = '';

  let closed = false;

  const cleanup = () => {
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    if (extraClass) {
      shell.classList.remove(extraClass);
    }
    shell.classList.add('hidden');
    shell.style.width = '';
    if (activeSession && activeSession.close === close) {
      activeSession = null;
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (typeof onClose === 'function') onClose();
    cleanup();
  };

  const onDocumentKeyDown = (e: KeyboardEvent) => {
    if (!activeSession || activeSession.close !== close) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  shell.classList.remove('hidden');
  document.addEventListener('keydown', onDocumentKeyDown, true);

  activeSession = { close };

  if (typeof onOpen === 'function') {
    onOpen({ body });
  }

  return { close };
}
