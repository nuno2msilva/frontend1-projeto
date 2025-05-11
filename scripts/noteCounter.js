// Custom element that displays note counts (completed/total) in the header
export class NoteCounter extends HTMLElement {
  // Initialize the component with shadow DOM for style encapsulation
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // Setup the component when added to DOM
  connectedCallback() {
    this.render();
    // Listen for updates to note data
    window.addEventListener('notes-updated', () => this.updateCount());
    // Initial count update
    this.updateCount();
  }

  // Update the counter with current note statistics
  updateCount() {
    // Get note data from global function or use empty defaults
    const data = window.getNotesData ? window.getNotesData() : {total: 0, completed: 0};
    // Update the display with the completed/total format
    this.shadowRoot.querySelector('.counter').textContent = `(${data.completed}/${data.total})`;
  }

  // Create the visual representation of the counter
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
          margin-left: 10px;
          font-size: 0.8em;
          opacity: 0.8;
        }
      </style>
      <span class="counter">(0/0)</span>
    `;
  }
}

// Register the custom element for use in HTML
customElements.define('note-counter', NoteCounter);