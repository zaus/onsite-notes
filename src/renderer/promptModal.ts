import { openModal } from './modalShell';

export type PromptModalOptions = {
  titleText?: string;
  labelText?: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  cancelText?: string;
  validate?: (value: string) => boolean | string | void;
  invalidMessage?: string;
};

export function showPromptModal(options: PromptModalOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const template = document.getElementById('prompt-modal-template') as HTMLTemplateElement | null;
    const content = template?.content?.cloneNode(true) as DocumentFragment | undefined;
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

    const setValidationMessage = (message: string) => {
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
