/**
 * New Note Creation Module
 */
const CreateNote = {
  /**
   * Initialize note creation functionality
   */
  init() {
    // Track state
    this.isEditing = false;
    this.hasUnsavedChanges = false;
    this.editingNoteId = null; // Track which note is being edited
    
    // Setup event listeners
    this.setupEventListeners();
  },

  /**
   * Setup event listeners for note creation
   */
  setupEventListeners() {
    // New note button click
    const newNoteBtn = document.getElementById('new-note');
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', () => this.showInlineNoteEditor());
    }
    
    // Edit button clicks - delegate to document level
    document.addEventListener('click', (e) => {
      // Check if edit button was clicked
      if (e.target.classList.contains('edit-note') || e.target.closest('.edit-note')) {
        // Find the parent note
        const noteEl = e.target.closest('.note-entry');
        if (noteEl && noteEl.dataset.id) {
          e.stopPropagation(); // Prevent opening the note
          this.showInlineNoteEditor(noteEl.dataset.id);
        }
      }
    });

    // Prevent navigation when there are unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges) {
        // Standard way to show confirmation dialog on page leave
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });

    // Handle clicks outside the editor - use capture phase
    document.addEventListener('click', (e) => {
      // Don't close when clicking in the editor or its children
      if (e.target.closest('.note-entry-editor')) {
        return; 
      }
      
      // Don't close when clicking the new note button
      if (e.target.closest('#new-note')) {
        return;
      }
      
      // Explicitly check for textarea and inputs as additional safety
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        return;
      }
      
      // If we get here and we're editing, handle outside click
      if (this.isEditing) {
        if (this.hasUnsavedChanges) {
          this.showConfirmationModal();
        } else {
          this.removeEditor();
        }
      }
    }, true);
    
    // Prevent other notes from being expanded while editing
    document.addEventListener('click', (e) => {
      if (this.isEditing) {
        const clickedNote = e.target.closest('.note-entry');
        if (clickedNote && !clickedNote.classList.contains('note-entry-editor')) {
          // If a regular note is clicked while editing, prevent expansion
          e.stopPropagation();
          e.preventDefault();
          return false;
        }
      }
    }, true);
  },

  /**
   * Show inline note editor for new or existing note
   * @param {string} noteId - Optional note ID for editing
   */
  showInlineNoteEditor(noteId = null) {
    // Don't show another editor if one is already open
    if (this.isEditing) return;
    
    // Close any other expanded notes first
    const activeNotes = document.querySelectorAll('.note-entry.active');
    activeNotes.forEach(note => {
      note.classList.remove('active');
    });
    
    // Set editing mode
    this.isEditing = true;
    this.editingNoteId = noteId; // Track if we're editing an existing note
    
    // Create editor note element
    const editorNote = document.createElement('div');
    editorNote.className = 'note-entry note-entry-editor active'; 
    editorNote.dataset.id = noteId || 'new-note-editor';
    
    // Default content for new note
    let noteTitle = '';
    let noteDescription = '';
    
    // If editing existing note, get its data
    if (noteId) {
      const notes = JSON.parse(localStorage.getItem('notes') || '[]');
      const noteToEdit = notes.find(note => note.id === noteId);
      if (noteToEdit) {
        noteTitle = noteToEdit.title;
        noteDescription = noteToEdit.description;
        
        // Hide the original note while editing
        const originalNote = document.querySelector(`.note-entry[data-id="${noteId}"]`);
        if (originalNote && originalNote !== editorNote) {
          originalNote.style.display = 'none';
        }
      }
    }
    
    editorNote.innerHTML = `
      <div class="note-title editor-title">
        <div class="title-container">
          <input type="text" id="note-title-input" placeholder="Note title" autocomplete="off" value="${this.escapeHtml(noteTitle)}">
        </div>
      </div>
      <div class="note-details">
        <textarea id="note-description-input" placeholder="Note description...">${this.escapeHtml(noteDescription)}</textarea>
        <div class="button-row">
          <div class="action-buttons">
            <button id="save-new-note" class="primary-button">${noteId ? 'Update' : 'Save'}</button>
            <button id="cancel-new-note" class="secondary-button">Cancel</button>
          </div>
        </div>
      </div>
    `;
    
    // Add to the notes area
    const notesArea = document.getElementById('notes-area');
    if (notesArea) {
      if (noteId) {
        // For editing, insert at the position of the original note
        const originalNote = document.querySelector(`.note-entry[data-id="${noteId}"]`);
        if (originalNote) {
          originalNote.parentNode.insertBefore(editorNote, originalNote);
        } else {
          // Fallback to top of list
          if (notesArea.firstChild) {
            notesArea.insertBefore(editorNote, notesArea.firstChild);
          } else {
            notesArea.appendChild(editorNote);
          }
        }
      } else {
        // New notes go at the top
        if (notesArea.firstChild) {
          notesArea.insertBefore(editorNote, notesArea.firstChild);
        } else {
          notesArea.appendChild(editorNote);
        }
      }
      
      // Focus the title input
      setTimeout(() => {
        const titleInput = document.getElementById('note-title-input');
        if (titleInput) {
          titleInput.focus();
          // Place cursor at end of text
          if (noteTitle) {
            titleInput.selectionStart = titleInput.selectionEnd = noteTitle.length;
          }
        }
      }, 100);
      
      // Setup editor listeners
      this.setupEditorListeners();
      
      // Update state
      this.hasUnsavedChanges = false;
      
      // Prevent the editor from being collapsed
      this.preventEditorCollapse();
    }
  },
  
  /**
   * Prevent editor from being collapsed while editing
   */
  preventEditorCollapse() {
    // Protect the entire editor note from click events that might close it
    const editorNote = document.querySelector('.note-entry-editor');
    if (editorNote) {
      // Prevent any clicks inside the editor from propagating to document
      editorNote.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      // Specifically protect the description area
      const descArea = document.getElementById('note-description-input');
      if (descArea) {
        descArea.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        
        // Also prevent mousedown events which might interfere
        descArea.addEventListener('mousedown', (e) => {
          e.stopPropagation();
        });
      }
    }
  },

  /**
   * Setup content change tracking
   */
  setupEditorListeners() {
    const titleInput = document.getElementById('note-title-input');
    const descInput = document.getElementById('note-description-input');
    const saveBtn = document.getElementById('save-new-note');
    const cancelBtn = document.getElementById('cancel-new-note');
    
    // Monitor changes
    const checkChanges = () => {
      const hasTitle = titleInput?.value.trim().length > 0;
      const hasDesc = descInput?.value.trim().length > 0;
      this.hasUnsavedChanges = hasTitle || hasDesc;
    };
    
    titleInput?.addEventListener('input', checkChanges);
    descInput?.addEventListener('input', checkChanges);
    
    // Save button
    saveBtn?.addEventListener('click', () => this.saveNote());
    
    // Cancel button
    cancelBtn?.addEventListener('click', () => {
      if (this.hasUnsavedChanges) {
        this.showConfirmationModal();
      } else {
        this.removeEditor();
      }
    });
  },
  
  /**
   * Show confirmation modal for unsaved changes
   */
  showConfirmationModal() {
    // Cache input values before showing modal
    const titleInput = document.getElementById('note-title-input');
    const descInput = document.getElementById('note-description-input');
    
    if (titleInput && descInput) {
      this.cachedTitle = titleInput.value.trim();
      this.cachedDescription = descInput.value.trim();
      
      // Log to verify values are captured
      console.log('Cached values:', { title: this.cachedTitle, desc: this.cachedDescription });
    } else {
      console.error('Failed to find input elements for caching');
    }
    
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'confirmation-modal-overlay';
    
    // Create modal content
    modalOverlay.innerHTML = `
      <div class="confirmation-modal">
        <h3>Unsaved Changes</h3>
        <p>Your note has unsaved changes. What would you like to do?</p>
        <div class="modal-buttons">
          <button id="save-changes" class="primary-button">${this.editingNoteId ? 'Update' : 'Save'}</button>
          <button id="discard-changes" class="warning-button">Discard</button>
        </div>
      </div>
    `;
    
    // Add to document
    document.body.appendChild(modalOverlay);
    
    // Setup modal buttons
    document.getElementById('save-changes')?.addEventListener('click', () => {
      // Prevent premature removal of the modal
      if (this.cachedTitle) {
        try {
          if (this.editingNoteId) {
            NotesManager.updateNote(this.editingNoteId, this.cachedTitle, this.cachedDescription);
          } else {
            NotesManager.createNote(this.cachedTitle, this.cachedDescription);
          }
          document.body.removeChild(modalOverlay);
          this.hasUnsavedChanges = false;
          this.removeEditor();
        } catch (error) {
          console.error('Error saving note:', error);
          alert('Error saving note: ' + (error.message || 'Unknown error'));
        }
      } else {
        alert('Please enter a title for your note');
        document.body.removeChild(modalOverlay);
      }
    });
    
    document.getElementById('discard-changes')?.addEventListener('click', () => {
      document.body.removeChild(modalOverlay);
      this.hasUnsavedChanges = false;
      this.removeEditor();
    });
    
    // Prevent clicks from propagating
    modalOverlay.addEventListener('click', e => e.stopPropagation());
  },
  
  /**
   * Save the note (create or update)
   */
  saveNote() {
    const titleInput = document.getElementById('note-title-input');
    const descInput = document.getElementById('note-description-input');
    
    // Check if input elements were found
    if (!titleInput || !descInput) {
      console.error('Could not find input elements');
      alert('An error occurred. Please try again.');
      return;
    }
    
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    
    // Title is required
    if (!title || title.length === 0) {
      alert('Please enter a title for your note');
      titleInput.focus();
      return;
    }
    
    try {
      if (this.editingNoteId) {
        // Update existing note
        NotesManager.updateNote(this.editingNoteId, title, description);
      } else {
        // Create new note
        NotesManager.createNote(title, description);
      }
      
      // Close the editor
      this.hasUnsavedChanges = false;
      this.removeEditor();
      
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Error saving note: ' + (error.message || 'Unknown error'));
    }
  },
  
  /**
   * Remove the note editor and clean up
   */
  removeEditor() {
    const editorNote = document.querySelector('.note-entry-editor');
    
    // If we were editing an existing note, unhide it
    if (this.editingNoteId) {
      const originalNote = document.querySelector(`.note-entry[data-id="${this.editingNoteId}"]`);
      if (originalNote && originalNote !== editorNote) {
        originalNote.style.display = '';
      }
    }
    
    // Remove the editor
    if (editorNote && editorNote.parentNode) {
      editorNote.parentNode.removeChild(editorNote);
    }
    
    // Reset state
    this.isEditing = false;
    this.editingNoteId = null;
  },

  /**
   * Helper to escape HTML for safe insertion into templates
   */
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  CreateNote.init();
});