export function showPromptModal(options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('prompt-modal');
	if (!modal) {
		resolve(null);
		return;
    }
    const title = modal ? modal.querySelector('.modal-header h2') : null;
    const label = modal ? modal.querySelector('.modal-row label') : null;
    const input = modal ? modal.querySelector('input') : null;
    const validationMessage = modal ? modal.querySelector('.validation') : null;
    const createButton = modal ? modal.querySelector('[data-confirm]') : null;
    const cancelButton = modal ? modal.querySelector('[data-cancel]') : null;
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

    if (!modal || !input || !validationMessage || !createButton || !cancelButton || !title || !label) {
      resolve(null);
      return;
    }

    title.textContent = titleText;
    label.textContent = labelText;
    input.placeholder = placeholder;
    createButton.textContent = confirmText;
    cancelButton.textContent = cancelText;
    const setValidationMessage = (message) => {
      const text = (message || '').trim();
      validationMessage.textContent = text;
      validationMessage.classList.toggle('hidden', text.length === 0);
    };

    const cleanup = () => {
      createButton.removeEventListener('click', onCreate);
      cancelButton.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('input', onInput);
      modal.classList.add('hidden');
      setValidationMessage('');
    };

    const finish = (value) => {
      cleanup();
      resolve(value);
    };

    const onCreate = () => {
      const value = input.value.trim();
      if (typeof validate === 'function') {
        const result = validate(value);
        if (result === false) {
          setValidationMessage(invalidMessage);
          return;
        }
        if (typeof result === 'string') {
          setValidationMessage(result);
          return;
        }
      }
      setValidationMessage('');
      finish(value || null);
    };

    const onCancel = () => finish(null);

    const onKeyDown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onCreate();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    const onInput = () => {
      setValidationMessage('');
    };

    input.value = initialValue;
    setValidationMessage('');
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 0);
    createButton.addEventListener('click', onCreate);
    cancelButton.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('input', onInput);
  });
}