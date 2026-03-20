type ModalCloseReason = 'confirm' | 'cancel';

type OpenModalContent = string | Node | DocumentFragment;

type ModalSession = {
  close: (reason?: ModalCloseReason) => Promise<void>;
};

type ModalElements = {
  modal: HTMLElement;
  modalContent: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
};

export type OpenModalContext = {
  modal: HTMLElement;
  body: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
};

export type OpenModalOptions = {
  titleText?: string;
  content?: OpenModalContent;
  confirmText?: string;
  cancelText?: string;
  showConfirm?: boolean;
  showCancel?: boolean;
  onOpen?: (context: OpenModalContext) => void;
  onConfirm?: () => boolean | void | Promise<boolean | void>;
  onCancel?: () => void;
  width?: string;
};

let activeSession: ModalSession | null = null;

function getModalElements(): ModalElements | null {
  const modal = document.getElementById('app-modal');
  const modalContent = document.getElementById('app-modal-content');
  const title = document.getElementById('app-modal-title');
  const body = document.getElementById('app-modal-body');
  const confirmButton = document.getElementById('app-modal-confirm');
  const cancelButton = document.getElementById('app-modal-cancel');
  const closeButton = document.getElementById('app-modal-close');

  if (!modal || !modalContent || !title || !body || !confirmButton || !cancelButton || !closeButton) {
    return null;
  }

  return {
    modal,
    modalContent,
    title,
    body,
    confirmButton: confirmButton as HTMLButtonElement,
    cancelButton: cancelButton as HTMLButtonElement,
    closeButton: closeButton as HTMLButtonElement
  };
}

function toNode(content: OpenModalContent = ''): Node {
  if (typeof content === 'string') {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content;
    return wrapper;
  }
  if (content instanceof DocumentFragment) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(content);
    return wrapper;
  }
  if (content instanceof Node) return content;

  return document.createElement('div');
}

export function openModal(options: OpenModalOptions = {}): ModalSession | null {
  const elements = getModalElements();
  if (!elements) return null;

  const {
    titleText = 'Modal',
    content = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    showConfirm = true,
    showCancel = true,
    onOpen,
    onConfirm,
    onCancel,
    width
  } = options;

  if (activeSession) {
    activeSession.close('cancel');
  }

  const { modal, modalContent, title, body, confirmButton, cancelButton, closeButton } = elements;
  const contentNode = toNode(content);
  const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  title.textContent = titleText;
  body.replaceChildren(contentNode);
  confirmButton.textContent = confirmText;
  cancelButton.textContent = cancelText;
  confirmButton.classList.toggle('hidden', !showConfirm);
  cancelButton.classList.toggle('hidden', !showCancel);
  modalContent.style.width = width || '';

  let closed = false;

  const cleanup = () => {
    confirmButton.removeEventListener('click', onConfirmClick);
    cancelButton.removeEventListener('click', onCancelClick);
    closeButton.removeEventListener('click', onCancelClick);
    modal.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    body.replaceChildren();
    modal.classList.add('hidden');
    modalContent.style.width = '';
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }
    if (activeSession && activeSession.close === close) {
      activeSession = null;
    }
  };

  const close = async (reason: ModalCloseReason = 'cancel') => {
    if (closed) return;
    closed = true;

    if (reason !== 'confirm' && typeof onCancel === 'function') {
      onCancel();
    }

    cleanup();
  };

  const onConfirmClick = async () => {
    if (typeof onConfirm !== 'function') {
      await close('confirm');
      return;
    }

    const keepOpen = (await onConfirm()) === false;
    if (!keepOpen) {
      await close('confirm');
    }
  };

  const onCancelClick = async () => {
    await close('cancel');
  };

  const onKeyDown = async (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      await close('cancel');
      return;
    }

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !confirmButton.classList.contains('hidden') &&
      !confirmButton.disabled
    ) {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      event.preventDefault();
      event.stopPropagation();
      await onConfirmClick();
    }
  };

  const onDocumentKeyDown = async (event: KeyboardEvent) => {
    if (!activeSession || activeSession.close !== close) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      await close('cancel');
      return;
    }

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !confirmButton.classList.contains('hidden') &&
      !confirmButton.disabled
    ) {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      event.preventDefault();
      event.stopPropagation();
      await onConfirmClick();
    }
  };

  modal.classList.remove('hidden');
  if (!modal.hasAttribute('tabindex')) {
    modal.setAttribute('tabindex', '-1');
  }
  modal.focus();
  confirmButton.addEventListener('click', onConfirmClick);
  cancelButton.addEventListener('click', onCancelClick);
  closeButton.addEventListener('click', onCancelClick);
  modal.addEventListener('keydown', onKeyDown);
  document.addEventListener('keydown', onDocumentKeyDown, true);

  activeSession = { close };

  if (typeof onOpen === 'function') {
    onOpen({ modal, body, confirmButton, cancelButton, closeButton });
  }

  return { close };
}
