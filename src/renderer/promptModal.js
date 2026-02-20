import { openModal } from './modalShell.js';

export function showPromptModal(options = {}) {
  return new Promise((resolve) => {
    const template = document.getElementById('prompt-modal-template');
    const content = template?.content?.cloneNode(true);
    const {
      titleText = 'Prompt',
      labelText = 'Value',
      placeholder = '',
      initialValue = '',
      confirmText = 'OK',
      cancelText = 'Cancel',
      validate,
      invalidMessage = 'Please enter a valid value.'
    } = options;

    if (!content) {
      resolve(null);
      return;
    }

    const label = content.querySelector('.modal-row label');
    const input = content.querySelector('input');
    const validationMessage = content.querySelector('.validation');

    if (!input || !validationMessage || !label) {
      resolve(null);
      return;
    }

    label.textContent = labelText;
    input.placeholder = placeholder;

    const setValidationMessage = (message) => {
      const text = (message || '').trim();
      validationMessage.textContent = text;
      validationMessage.classList.toggle('hidden', text.length === 0);
    };

    const onConfirm = () => {
      const value = input.value.trim();
      if (typeof validate === 'function') {
        const result = validate(value);
        if (result === false) {
          setValidationMessage(invalidMessage);
          return false;
        }
        if (typeof result === 'string') {
          setValidationMessage(result);
          return false;
        }
      }
      setValidationMessage('');
      resolve(value || null);
      return true;
    };

    const onInput = () => {
      setValidationMessage('');
    };

    input.value = initialValue;
    setValidationMessage('');
    input.addEventListener('input', onInput);

    openModal({
      titleText,
      content,
      confirmText,
      cancelText,
      width: '420px',
      onOpen: () => {
        setTimeout(() => input.focus(), 0);
      },
      onConfirm,
      onCancel: () => {
        resolve(null);
      }
    });
  });
}