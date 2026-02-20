export class AutocompleteWidget {
  constructor(container) {
    this.container = container;
    this.dropdown = null;
    this.items = [];
    this.selectedIndex = -1;
    this.onSelect = null;
    this.visible = false;
  }

  show(items, position, onSelect) {
    this.items = items;
    this.selectedIndex = 0;
    this.onSelect = onSelect;
    this.visible = true;

    if (!this.dropdown) {
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'autocomplete-dropdown';
      this.container.appendChild(this.dropdown);
    }

    this.dropdown.innerHTML = '';
    items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'autocomplete-item' + (i === 0 ? ' selected' : '');
      el.innerHTML = `<span class="ac-id">${item.id}</span>` +
        (item.project ? `<span class="ac-project">${item.project}</span>` : '');
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.select(i);
      });
      this.dropdown.appendChild(el);
    });

    this.dropdown.style.display = 'block';
    this.dropdown.style.left = position.x + 'px';
    this.dropdown.style.top = position.y + 'px';
  }

  hide() {
    this.visible = false;
    if (this.dropdown) {
      this.dropdown.style.display = 'none';
    }
  }

  select(index) {
    if (this.onSelect && this.items[index]) {
      this.onSelect(this.items[index]);
    }
    this.hide();
  }

  moveSelection(delta) {
    if (!this.visible || !this.items.length) return false;
    this.selectedIndex = Math.max(0, Math.min(this.items.length - 1, this.selectedIndex + delta));
    const els = this.dropdown.querySelectorAll('.autocomplete-item');
    els.forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedIndex);
    });
    return true;
  }

  confirmSelection() {
    if (!this.visible) return false;
    this.select(this.selectedIndex);
    return true;
  }
}
