// DOM utility functions for the Notes application
import { parseMarkdown } from './markdown.js';
import { canvas } from './canvas.js';

// Collection of DOM helper methods for creating and managing note elements
export const dom = {
  // Gets an element by ID
  getElement: id => document.getElementById(id),
  
  // Returns the main notes container element
  getNotesContainer: () => document.querySelector('main'),
  
  // Wrapper for document.querySelector
  querySelector: selector => document.querySelector(selector),
  
  // Wrapper for document.querySelectorAll
  querySelectorAll: selector => document.querySelectorAll(selector),

  // Prevents XSS attacks by escaping HTML special characters
  escapeHtml: text => {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  // Creates a new note element with appropriate structure and content
  createNoteElement: async function(note) {
    // Create the element structure
    const el = document.createElement('div');
    let completedClass = '';
    if (note.isCompleted) {
      completedClass = ' completed-note';
    }
    el.className = `note-entry${completedClass}`;
    el.dataset.id = note.id;

    // Parse markdown content for the note description
    const parsedContent = await parseMarkdown(note.description);

    // Build the inner HTML structure with note details
    let completionIndicator = '';
    if (note.isCompleted) {
      completionIndicator = '<canvas class="completion-indicator" width="24" height="24"></canvas>';
    }

    let editInfo = '';
    if (note.lastEdited) {
      editInfo = `<div class="edit-info">✏️ ${note.lastEdited.date} @ ${note.lastEdited.time}</div>`;
    }

    let completionInfo = '';
    if (note.isCompleted && note.completedAt) {
      completionInfo = `<div class="completion-info">✅ ${note.completedAt.date} @ ${note.completedAt.time}</div>`;
    }

    let completeButtonClass = '';
    let completeButtonLabel = '';
    if (note.isCompleted) {
      completeButtonClass = 'reset-note';
      completeButtonLabel = 'Mark as incomplete';
    } else {
      completeButtonClass = 'complete-note';
      completeButtonLabel = 'Mark as complete';
    }

    el.innerHTML = `
      <div class="note-title">
        <div class="title-container">
          <h2>${note.title}</h2>
          <p>🗓️ ${note.date} @ ${note.time}</p>
        </div>
        ${completionIndicator}
      </div>
      <div class="note-details">
        <div class="markdown-content">
          ${parsedContent}
        </div>
        <div class="button-row">
          <div>
            ${editInfo}
            ${completionInfo}
          </div>
          <div class="action-buttons">
            <button class="${completeButtonClass}" 
              aria-label="${completeButtonLabel}"></button>
            <button class="edit-note" aria-label="Edit note"></button>
            <button class="delete-note" aria-label="Delete note"></button>
          </div>
        </div>
      </div>`;

    // Draw completion indicator for completed notes
    if (note.isCompleted) {
      const canvasEl = el.querySelector('canvas');
      if (canvasEl) {
        canvas.drawCompletionIndicator(canvasEl);
      }
    }

    return el;
  },

  // Creates an editor element for creating or editing notes
  createEditorElement: function(noteId, title = '', description = '') {
    const editorNote = document.createElement('div');
    editorNote.className = 'note-entry note-entry-editor active';
    editorNote.dataset.id = noteId || 'new-note-editor';

    // Build the editor HTML structure with form elements
    editorNote.innerHTML = `
      <div class="note-title editor-title">
        <div class="title-container">
          <input type="text" id="note-title-input" maxlength="25" placeholder="Note title" autocomplete="off" value="${this.escapeHtml(title)}">
        </div>
      </div>
      <div class="note-details">
        <textarea id="note-description-input" placeholder="Note description...">${this.escapeHtml(description)}</textarea>
        <div class="editor-buttons">
          <button id="save-new-note" type="button" aria-label="Save note"></button>
          <button id="cancel-new-note" type="button" aria-label="Cancel editing"></button>
        </div>
      </div>
    `;

    return editorNote;
  }
};

export default dom;