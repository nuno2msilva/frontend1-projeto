const NotesManager = (() => {
  const STORAGE = { NOTES: 'notes', INIT: 'notesAppInitialized', VISIT: 'hasVisitedBefore' };
  
  // State variables
  let modalState = {
    deleteActive: false,
    changesActive: false
  };
  
  let editorState = {
    isActive: false,
    noteId: null,
    hasUnsavedChanges: false,
    cachedTitle: '',
    cachedDescription: ''
  };

  // Storage helpers
  const storage = {
    getNotes: () => JSON.parse(localStorage.getItem(STORAGE.NOTES) || '[]'),
    setNotes: notes => localStorage.setItem(STORAGE.NOTES, JSON.stringify(notes)),
    isInitialized: () => !!localStorage.getItem(STORAGE.INIT),
    setInitialized: () => localStorage.setItem(STORAGE.INIT, 'true'),
    hasVisited: () => !!localStorage.getItem(STORAGE.VISIT),
    setVisited: () => localStorage.setItem(STORAGE.VISIT, 'true')
  };

  // Time helpers
  const time = {
    makeTimestamp: date => ({
      date: date.toLocaleDateString('en-GB'),
      time: date.toLocaleTimeString('en-GB', { hour12: false }),
      timestamp: date.getTime()
    }),
    now: () => new Date()
  };

  // Modal handling
  const modal = {
    create: (id, { title, msg, buttons }) => {
      let m = document.getElementById(id);
      if (!m) {
        m = document.createElement('div');
        m.id = id;
        m.className = 'modal';
        m.innerHTML = `
          <div class="modal-content">
            <h3>${title}</h3>
            <p>${msg}</p>
            <div class="modal-buttons">
              ${buttons.map(b => `<button id="${b.id}" class="${b.cls}">${b.text}</button>`).join('')}
            </div>
          </div>`;
        document.body.appendChild(m);
        buttons.forEach(b => m.querySelector('#' + b.id).addEventListener('click', b.onClick));
      }
      return m;
    },
    show: id => document.getElementById(id).classList.add('active'),
    hide: id => document.getElementById(id).classList.remove('active'),
    
    showUnsaved: (id, onSave, onDiscard) => {
      if (modalState.changesActive) return;
      modalState.changesActive = true;
      
      modal.create('unsaved-modal', {
        title: 'Unsaved Changes',
        msg: 'Save changes before leaving?',
        buttons: [
          {
            id: 'unsave-cancel',
            text: 'Cancel',
            cls: 'secondary-button',
            onClick: () => {
              modal.hide('unsaved-modal');
              modalState.changesActive = false;
              setTimeout(onDiscard, 0);
            }
          },
          {
            id: 'unsave-ok',
            text: 'Save',
            cls: 'primary-button',
            onClick: () => {
              modal.hide('unsaved-modal');
              modalState.changesActive = false;
              setTimeout(onSave, 0);
            }
          }
        ]
      });
      modal.show('unsaved-modal');
    },
    
    showDeleteConfirm: (id, onConfirm) => {
      if (modalState.deleteActive) return;
      modalState.deleteActive = true;
      
      modal.create('delete-modal', {
        title: 'Delete Note?',
        msg: 'Are you sure? This cannot be undone.',
        buttons: [
          {
            id: 'del-cancel',
            text: 'Cancel',
            cls: 'secondary-button',
            onClick: () => {
              modal.hide('delete-modal');
              modalState.deleteActive = false;
            }
          },
          {
            id: 'del-ok',
            text: 'Delete',
            cls: 'warning-button',
            onClick: () => {
              modal.hide('delete-modal');
              modalState.deleteActive = false;
              onConfirm();
            }
          }
        ]
      });
      modal.show('delete-modal');
    }
  };

  // DOM helpers
  const dom = {
    getElement: id => document.getElementById(id),
    getNotesContainer: () => dom.getElement('notes-area'),
    querySelector: selector => document.querySelector(selector),
    querySelectorAll: selector => document.querySelectorAll(selector),
    
    escapeHtml: text => {
      if (!text) return '';
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },
    
    createNoteElement: note => {
      const el = document.createElement('div');
      el.className = `note-entry${note.isCompleted ? ' completed-note' : ''}`;
      el.dataset.id = note.id;
      
      el.innerHTML = `
        <div class="note-title">
          <div class="title-container">
            <h2>${note.title}</h2>
            <p>🗓️ ${note.date} @ ${note.time}</p>
          </div>
          ${note.isCompleted ? '<canvas class="completion-indicator" width="24" height="24"></canvas>' : ''}
        </div>
        <div class="note-details">
          <p>${note.description || 'No description provided.'}</p>
          ${note.isCompleted && note.completedAt 
            ? `<div class="completion-info">✅ ${note.completedAt.date} @ ${note.completedAt.time}</div>` 
            : ''}
          <div class="button-row">
            <button class="${note.isCompleted ? 'reset-note' : 'complete-note'}"></button>
            <button class="edit-note"></button>
            <button class="delete-note"></button>
          </div>
        </div>`;
        
      if (note.isCompleted) {
        const canvas = el.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(12, 12, 11, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(76,175,80,0.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(6, 12);
        ctx.lineTo(11, 17);
        ctx.lineTo(18, 8);
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      return el;
    },
    
    createEditorElement: (noteId, title = '', description = '') => {
      const editorNote = document.createElement('div');
      editorNote.className = 'note-entry note-entry-editor active';
      editorNote.dataset.id = noteId || 'new-note-editor';
      
      editorNote.innerHTML = `
        <div class="note-title editor-title">
          <div class="title-container">
            <input type="text" id="note-title-input" placeholder="Note title" autocomplete="off" value="${dom.escapeHtml(title)}">
          </div>
        </div>
        <div class="note-details">
          <textarea id="note-description-input" placeholder="Note description...">${dom.escapeHtml(description)}</textarea>
          <div class="button-row">
            <div class="action-buttons">
              <button id="save-new-note" class="primary-button">${noteId ? 'Update' : 'Save'}</button>
              <button id="cancel-new-note" class="secondary-button">Cancel</button>
            </div>
          </div>
        </div>
      `;
      
      return editorNote;
    }
  };

  // Note operations
  const notes = {
    create: (title, description = '') => {
      const now = time.now();
      const note = {
        id: `note_${now.getTime()}`,
        title,
        description,
        ...time.makeTimestamp(now),
        isCompleted: false
      };
      
      const allNotes = storage.getNotes();
      storage.setNotes([note, ...allNotes]);
      displayNotes();
      return note;
    },
    
    update: (id, title, description = '') => {
      const allNotes = storage.getNotes().map(n => 
        n.id === id 
          ? { ...n, title, description, lastEdited: time.makeTimestamp(time.now()) }
          : n
      );
      
      storage.setNotes(allNotes);
      displayNotes();
      return allNotes.find(n => n.id === id);
    },
    
    toggleCompletion: id => {
      const allNotes = storage.getNotes().map(n => {
        if (n.id === id) {
          n.isCompleted = !n.isCompleted;
          if (n.isCompleted) {
            n.completedAt = time.makeTimestamp(time.now());
          } else {
            delete n.completedAt;
          }
        }
        return n;
      });
      
      storage.setNotes(allNotes);
      displayNotes();
    },
    
    delete: id => {
      modal.showDeleteConfirm(id, () => {
        storage.setNotes(storage.getNotes().filter(n => n.id !== id));
        displayNotes();
      });
    }
  };

  // Editor operations
  const editor = {
    startEditing: (noteId = null) => {
      // Don't show another editor if one is already open
      if (editorState.isActive) return;
      
      // Close any other expanded notes first
      dom.querySelectorAll('.note-entry.active').forEach(note => {
        note.classList.remove('active');
      });
      
      // Set editing mode
      editorState.isActive = true;
      editorState.noteId = noteId;
      editorState.hasUnsavedChanges = false;
      
      // Default content for new note
      let noteTitle = '';
      let noteDescription = '';
      
      // If editing existing note, get its data
      if (noteId) {
        const noteToEdit = storage.getNotes().find(note => note.id === noteId);
        if (noteToEdit) {
          noteTitle = noteToEdit.title;
          noteDescription = noteToEdit.description;
          
          // Hide the original note while editing
          const originalNote = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
          if (originalNote) {
            originalNote.style.display = 'none';
          }
        }
      }
      
      // Create editor element
      const editorEl = dom.createEditorElement(noteId, noteTitle, noteDescription);
      
      // Add to the notes area
      const notesArea = dom.getNotesContainer();
      if (notesArea) {
        if (noteId) {
          // For editing, insert at the position of the original note
          const originalNote = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
          if (originalNote) {
            originalNote.parentNode.insertBefore(editorEl, originalNote);
          } else {
            // Fallback to top of list
            notesArea.insertBefore(editorEl, notesArea.firstChild || null);
          }
        } else {
          // New notes go at the top
          notesArea.insertBefore(editorEl, notesArea.firstChild || null);
        }
        
        // Focus the title input
        setTimeout(() => {
          const titleInput = dom.getElement('note-title-input');
          if (titleInput) {
            titleInput.focus();
            // Place cursor at end of text
            if (noteTitle) {
              titleInput.selectionStart = titleInput.selectionEnd = noteTitle.length;
            }
          }
        }, 100);
        
        // Setup editor listeners
        editor.setupListeners();
        editor.preventCollapse();
      }
    },
    
    stopEditing: () => {
      const editorEl = dom.querySelector('.note-entry-editor');
      
      // If we were editing an existing note, unhide it
      if (editorState.noteId) {
        const originalNote = dom.querySelector(`.note-entry[data-id="${editorState.noteId}"]`);
        if (originalNote && originalNote !== editorEl) {
          originalNote.style.display = '';
        }
      }
      
      // Remove the editor
      if (editorEl && editorEl.parentNode) {
        editorEl.parentNode.removeChild(editorEl);
      }
      
      // Reset state
      editorState.isActive = false;
      editorState.noteId = null;
      editorState.hasUnsavedChanges = false;
    },
    
    saveCurrentNote: () => {
      const titleInput = dom.getElement('note-title-input');
      const descInput = dom.getElement('note-description-input');
      
      if (!titleInput || !descInput) {
        console.error('Could not find input elements');
        return;
      }
      
      const title = titleInput.value.trim();
      const description = descInput.value.trim();
      
      // Title is required
      if (!title) {
        alert('Please enter a title for your note');
        titleInput.focus();
        return;
      }
      
      try {
        if (editorState.noteId) {
          // Update existing note
          notes.update(editorState.noteId, title, description);
        } else {
          // Create new note
          notes.create(title, description);
        }
        
        // Close the editor
        editorState.hasUnsavedChanges = false;
        editor.stopEditing();
        
      } catch (error) {
        console.error('Error saving note:', error);
      }
    },
    
    confirmUnsavedChanges: () => {
      // Cache input values before showing modal
      const titleInput = dom.getElement('note-title-input');
      const descInput = dom.getElement('note-description-input');
      
      if (titleInput && descInput) {
        editorState.cachedTitle = titleInput.value.trim();
        editorState.cachedDescription = descInput.value.trim();
      }
      
      // Use modal system
      modal.showUnsaved(
        editorState.noteId,
        // Save callback
        () => {
          if (editorState.cachedTitle) {
            try {
              if (editorState.noteId) {
                notes.update(editorState.noteId, editorState.cachedTitle, editorState.cachedDescription);
              } else {
                notes.create(editorState.cachedTitle, editorState.cachedDescription);
              }
              editorState.hasUnsavedChanges = false;
              editor.stopEditing();
            } catch (error) {
              console.error('Error saving note:', error);
            }
          }
        },
        // Discard callback
        () => {
          editorState.hasUnsavedChanges = false;
          editor.stopEditing();
          displayNotes();
        }
      );
    },
    
    setupListeners: () => {
      const titleInput = dom.getElement('note-title-input');
      const descInput = dom.getElement('note-description-input');
      const saveBtn = dom.getElement('save-new-note');
      const cancelBtn = dom.getElement('cancel-new-note');
      
      // Monitor changes
      const checkChanges = () => {
        const hasTitle = titleInput?.value.trim().length > 0;
        const hasDesc = descInput?.value.trim().length > 0;
        editorState.hasUnsavedChanges = hasTitle || hasDesc;
      };
      
      titleInput?.addEventListener('input', checkChanges);
      descInput?.addEventListener('input', checkChanges);
      
      // Save button
      saveBtn?.addEventListener('click', editor.saveCurrentNote);
      
      // Cancel button
      cancelBtn?.addEventListener('click', () => {
        if (editorState.hasUnsavedChanges) {
          editor.confirmUnsavedChanges();
        } else {
          editor.stopEditing();
        }
      });
    },
    
    preventCollapse: () => {
      // Protect the entire editor note from click events that might close it
      const editorEl = dom.querySelector('.note-entry-editor');
      if (editorEl) {
        // Prevent any clicks inside the editor from propagating to document
        editorEl.addEventListener('click', e => {
          e.stopPropagation();
        });
        
        // Specifically protect the description area
        const descArea = dom.getElement('note-description-input');
        if (descArea) {
          descArea.addEventListener('click', e => {
            e.stopPropagation();
          });
          
          // Also prevent mousedown events which might interfere
          descArea.addEventListener('mousedown', e => {
            e.stopPropagation();
          });
        }
      }
    },
    
    handleOutsideClick: e => {
      // Don't close when clicking in the editor or its children
      if (e.target.closest('.note-entry-editor') || e.target.closest('#new-note')) {
        return;
      }
      
      // If we're editing and modal isn't active, handle outside click
      if (editorState.isActive && !modalState.changesActive) {
        if (editorState.hasUnsavedChanges) {
          editor.confirmUnsavedChanges();
        } else {
          editor.stopEditing();
        }
      }
    }
  };

  // Display functions
  function displayNotes() {
    const notesArea = dom.getNotesContainer();
    if (!notesArea) return;
    
    // Save editor if present
    const editorEl = notesArea.querySelector('.note-entry-editor');
    if (editorEl) editorEl.remove();
    
    // Clear and repopulate
    notesArea.innerHTML = '';
    const allNotes = storage.getNotes();
    
    if (!allNotes.length) {
      notesArea.innerHTML = '<div class="empty-state"><p>No notes yet.</p></div>';
      return;
    }
    
    allNotes.forEach(note => {
      notesArea.appendChild(dom.createNoteElement(note));
    });
    
    // Restore editor if it was present
    if (editorEl) notesArea.prepend(editorEl);
    
    // After all notes are rendered, update scroll indicators
    if (notesArea) {
      setTimeout(() => updateScrollIndicators(notesArea), 100);
    }
  }

  // Scroll indicator functions
  function updateScrollIndicators(el) {
    // Get indicators
    const topIndicator = document.querySelector('.scroll-indicator-top');
    const bottomIndicator = document.querySelector('.scroll-indicator-bottom');
    
    if (!topIndicator || !bottomIndicator) return;
    
    // Check if we can scroll up (more than 10px scrolled)
    const canScrollUp = el.scrollTop > 10;
    
    // Check if we can scroll down (more than 10px remaining)
    const canScrollDown = el.scrollHeight - el.scrollTop - el.clientHeight > 10;
    
    // Update visibility
    topIndicator.classList.toggle('visible', canScrollUp);
    bottomIndicator.classList.toggle('visible', canScrollDown);
  }

  // Bootstrap
  function bootstrap() {
    if (storage.isInitialized()) return;
    
    if (!storage.hasVisited()) {
      storage.setVisited();
      
      const allNotes = storage.getNotes();
      if (allNotes.length === 0) {
        const now = time.now();
        const baseTime = time.makeTimestamp(now);
        
        storage.setNotes([
          {
            id: 'example_1',
            title: 'Welcome to Notes App',
            description: 'This is your first note!',
            ...baseTime,
            isCompleted: false
          },
          {
            id: 'example_2',
            title: 'Click to Expand',
            description: 'Notes work like spoilers - click me!',
            ...baseTime,
            isCompleted: false
          },
          {
            id: 'example_3',
            title: 'Creating New Notes',
            description: 'Use the + button to add notes.',
            ...baseTime,
            isCompleted: false
          }
        ]);
      }
    }
    
    storage.setInitialized();
  }

  // Event handlers
  function setupEvents() {
    const notesArea = dom.getNotesContainer();
    if (!notesArea) return;
    
    // Handle note clicks (expand/collapse)
    notesArea.addEventListener('click', e => {
      if (modalState.changesActive || editorState.isActive) return;
      
      const noteEl = e.target.closest('.note-entry');
      if (!noteEl) return;
      
      if (e.target.closest('button')) {
        const noteId = noteEl.dataset.id;
        const btn = e.target.closest('button');
        
        if (btn.classList.contains('complete-note') || btn.classList.contains('reset-note')) {
          return notes.toggleCompletion(noteId);
        }
        
        if (btn.classList.contains('delete-note')) {
          return notes.delete(noteId);
        }
        
        if (btn.classList.contains('edit-note')) {
          return editor.startEditing(noteId);
        }
      }
      
      // Toggle active state (expand/collapse)
      const wasActive = noteEl.classList.contains('active');
      notesArea.querySelectorAll('.note-entry.active').forEach(n => n.classList.remove('active'));
      if (!wasActive) noteEl.classList.add('active');
    });
    
    // New note button click
    const newNoteBtn = dom.getElement('new-note');
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', () => editor.startEditing());
    }
    
    // Handle clicks outside the editor - use capture phase
    document.addEventListener('click', editor.handleOutsideClick, true);
    
    // Add scroll indicators
    if (notesArea) {
      // Initial check
      updateScrollIndicators(notesArea);
      
      // Monitor scrolling
      notesArea.addEventListener('scroll', () => {
        updateScrollIndicators(notesArea);
      });
      
      // Update on window resize too
      window.addEventListener('resize', () => {
        updateScrollIndicators(notesArea);
      });
    }
  }

  // Update layout variables
  function updateLayoutVariables() {
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    
    if (header) {
      document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }
    
    if (footer) {
      // Consistent footer spacing - 80px padding ensures button remains accessible
      document.documentElement.style.setProperty('--footer-padding', '60px');
      document.documentElement.style.setProperty('--footer-height', `${footer.offsetHeight}px`);
    }
  }

  // Initialize the app when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    bootstrap();
    
    // Create scroll indicators
    const container = document.querySelector('.container') || document.body;
    const topIndicator = document.createElement('div');
    topIndicator.className = 'scroll-indicator scroll-indicator-top';
    const bottomIndicator = document.createElement('div');
    bottomIndicator.className = 'scroll-indicator scroll-indicator-bottom';
    
    container.appendChild(topIndicator);
    container.appendChild(bottomIndicator);
    
    displayNotes();
    setupEvents();
    
    // Update layout variables
    updateLayoutVariables();
    window.addEventListener('resize', updateLayoutVariables);
  });

  // Public API
  return {
    createNote: notes.create,
    updateNote: notes.update,
    toggleCompletion: notes.toggleCompletion,
    deleteNote: notes.delete,
    showUnsaved: modal.showUnsaved,
    showInlineNoteEditor: editor.startEditing
  };
})();

window.NotesManager = NotesManager;