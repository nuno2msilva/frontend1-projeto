const NotesManager = (() => {
  const API_URL = 'https://67f5684b913986b16fa476f9.mockapi.io/api/onion/NoteTaking';
  const STORAGE = { INIT: 'notesAppInitialized', VISIT: 'hasVisitedBefore' };
  
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

  // Add a local notes cache at the top of the module
  let localNotesCache = [];

  // API helpers
  const api = {
    getNotes: async () => {
      try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch notes');
        return await response.json();
      } catch (error) {
        console.error('Error fetching notes:', error);
        return []; // Return empty array on error
      }
    },
    
    createNote: async (note) => {
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(note)
        });
        if (!response.ok) throw new Error('Failed to create note');
        return await response.json();
      } catch (error) {
        console.error('Error creating note:', error);
        return null;
      }
    },
    
    updateNote: async (id, note) => {
      try {
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(note)
        });
        if (!response.ok) throw new Error('Failed to update note');
        return await response.json();
      } catch (error) {
        console.error('Error updating note:', error);
        return null;
      }
    },
    
    deleteNote: async (id) => {
      try {
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete note');
        return true;
      } catch (error) {
        console.error('Error deleting note:', error);
        return false;
      }
    }
  };

  // Time helpers
  const time = {
    makeTimestamp: date => ({
      date: date.toLocaleDateString('en-GB'),
      time: date.toLocaleTimeString('en-GB', { hour12: false }),
      timestamp: date.getTime()
    }),
    now: () => new Date(),
    
    // New helper to normalize timestamps from API
    normalizeNote: (note) => {
      // If timestamps are missing, create them from the ID or current time
      if (!note.date || !note.time) {
        const timestamp = note.timestamp || parseInt(note.id.replace(/\D/g, '')) || Date.now();
        const date = new Date(timestamp);
        
        note.date = date.toLocaleDateString('en-GB');
        note.time = date.toLocaleTimeString('en-GB', { hour12: false });
        note.timestamp = date.getTime();
      }
      return note;
    }
  };

  // Modal handling
  const modal = {
    create: (id, { title, msg, buttons }) => {
      let m = document.getElementById(id);
      
      // Create if doesn't exist, or reset if it does
      if (!m) {
        m = document.createElement('div');
        m.id = id;
        m.className = 'modal';
        document.body.appendChild(m);
      }
      
      // Always update content
      m.innerHTML = `
        <div class="modal-content">
          <h3>${title}</h3>
          <p>${msg}</p>
          <div class="modal-buttons">
            ${buttons.map(b => `<button id="${b.id}" class="${b.cls}">${b.text}</button>`).join('')}
          </div>
        </div>`;
      
      // Always attach fresh event listeners
      buttons.forEach(b => {
        const btnEl = m.querySelector('#' + b.id);
        if (btnEl) {
          // Remove old listeners first (clean slate)
          const newBtn = btnEl.cloneNode(true);
          btnEl.parentNode.replaceChild(newBtn, btnEl);
          newBtn.addEventListener('click', b.onClick);
        }
      });
      
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
              setTimeout(() => {
                modalState.deleteActive = false;
                onConfirm();
              }, 50);
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
      
      // Prepare the timestamps section
      let timestampsHTML = '<div>';
      
      // Show edit timestamp if it exists
      if (note.lastEdited) {
        timestampsHTML += `<div class="edit-info">✏️ ${note.lastEdited.date} @ ${note.lastEdited.time}</div>`;
      }
      
      // Show completion timestamp if completed
      if (note.isCompleted && note.completedAt) {
        timestampsHTML += `<div class="completion-info">✅ ${note.completedAt.date} @ ${note.completedAt.time}</div>`;
      }
      
      // Close the timestamps container if empty
      if (!note.lastEdited && !(note.isCompleted && note.completedAt)) {
        timestampsHTML += '</div>';
      } else {
        timestampsHTML += '</div>';
      }
      
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
          <div class="button-row">
            ${timestampsHTML}
            <div class="action-buttons">
              <button class="${note.isCompleted ? 'reset-note' : 'complete-note'}"></button>
              <button class="edit-note"></button>
              <button class="delete-note"></button>
            </div>
          </div>
        </div>`;
        
      // Draw completion indicator
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
          <div class="editor-buttons">
            <button id="save-new-note" type="button"></button>
            <button id="cancel-new-note" type="button"></button>
          </div>
        </div>
      `;
      
      return editorNote;
    }
  };

  // Auto-resize textarea as content is entered
  function setupAutoResizeTextarea() {
    const textarea = document.getElementById('note-description-input');
    if (!textarea) return;
    
    // Initial height adjustment
    adjustHeight(textarea);
    
    // Listen for input events
    textarea.addEventListener('input', function() {
      adjustHeight(this);
    });
    
    // Function to adjust height
    function adjustHeight(element) {
      // Reset height temporarily to get the proper scrollHeight
      element.style.height = 'auto';
      // Set to scrollHeight to expand properly
      element.style.height = (element.scrollHeight) + 'px';
    }
  }

  // Improved function to animate notes sliding between positions
  function animateNotesPositionChange(notesArea, noteId, isCompleting) {
    // Find all notes
    const notes = Array.from(notesArea.querySelectorAll('.note-entry:not(.note-entry-editor)'));
    const positions = {};
    
    // Step 1: Record initial positions of ALL notes
    notes.forEach(note => {
      const rect = note.getBoundingClientRect();
      positions[note.dataset.id] = {
        top: rect.top,
        left: rect.left
      };
    });
    
    // Step 2: Apply status change and trigger a reflow
    const targetNote = notes.find(note => note.dataset.id === noteId);
    if (targetNote) {
      if (isCompleting) {
        targetNote.classList.add('completing');
      } else {
        targetNote.classList.add('uncompleting');
      }
    }
    
    // Step 3: Update data model and sort notes
    // (This happens in the calling function - toggle completion or update)
    
    // Step 4: Wait for DOM update, then animate
    requestAnimationFrame(() => {
      // Get new positions after DOM update
      notes.forEach(note => {
        const id = note.dataset.id;
        const oldPos = positions[id];
        const newRect = note.getBoundingClientRect();
        
        // If position changed, animate the transition
        if (oldPos && (Math.abs(oldPos.top - newRect.top) > 5 || Math.abs(oldPos.left - newRect.left) > 5)) {
          // Calculate the difference
          const deltaY = oldPos.top - newRect.top;
          
          // First place the note visually where it was
          note.style.transform = `translateY(${deltaY}px)`;
          
          // Add moving class for z-index and highlight
          note.classList.add('moving');
          
          // Force another reflow to ensure the transform is applied
          note.offsetHeight;
          
          // Now animate to the final position (removing transform)
          requestAnimationFrame(() => {
            note.style.transform = '';
          });
          
          // Remove animation classes after transition completes
          setTimeout(() => {
            note.classList.remove('moving', 'completing', 'uncompleting');
          }, 2000); // Match the CSS transition duration
        }
      });
    });
  }

  // Note operations
  const notes = {
    create: async (title, description = '') => {
      const now = time.now();
      const note = {
        id: `note_${now.getTime()}`,
        title,
        description,
        ...time.makeTimestamp(now),
        isCompleted: false
      };
      
      // Add to local cache first
      localNotesCache.unshift(note);
      
      // Create element and animate it
      const newNoteEl = dom.createNoteElement(note);
      newNoteEl.classList.add('inserting');
      const notesArea = dom.getNotesContainer();
      notesArea.insertBefore(newNoteEl, notesArea.firstChild);
      
      // Send to API in background
      api.createNote(note).then(result => {
        // If API returns with different ID, update our local cache
        if (result && result.id !== note.id) {
          const index = localNotesCache.findIndex(n => n.id === note.id);
          if (index !== -1) {
            localNotesCache[index] = result;
          }
        }
      });
      
      // Remove animation class after animation completes
      setTimeout(() => newNoteEl.classList.remove('inserting'), 400);
      return note;
    },
    
    update: async (id, title, description = '') => {
      // Find note in local cache
      const index = localNotesCache.findIndex(n => n.id === id);
      if (index === -1) return null;
      
      // Update local cache first
      const updatedNote = {
        ...localNotesCache[index],
        title,
        description,
        lastEdited: time.makeTimestamp(time.now())
      };
      localNotesCache[index] = updatedNote;

      // Update UI with smooth transition
      await displayNotes(false); // Use local cache

      // Update API in background
      api.updateNote(id, updatedNote);
      return updatedNote;
    },
    
    toggleCompletion: async (id) => {
      // First update the model
      const index = localNotesCache.findIndex(n => n.id === id);
      if (index === -1) return;
      
      const note = {...localNotesCache[index]};
      const isCompleting = !note.isCompleted;
      note.isCompleted = isCompleting;
      
      if (isCompleting) {
        note.completedAt = time.makeTimestamp(time.now());
      } else {
        delete note.completedAt;
      }
      
      // Update local cache first
      localNotesCache[index] = note;
      
      // Sort the data before animating
      localNotesCache.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) {
          return a.isCompleted ? 1 : -1;
        }
        const aTime = a.lastEdited ? a.lastEdited.timestamp : a.timestamp;
        const bTime = b.lastEdited ? b.lastEdited.timestamp : b.timestamp;
        return bTime - aTime;
      });
      
      // Now animate using the sorted data
      const notesArea = dom.getNotesContainer();
      animateNotesPositionChange(notesArea, id, isCompleting);
      
      // Update API in the background
      api.updateNote(id, note);
      
      // ONLY after animation is complete (2s), refresh display if needed
      setTimeout(() => {
        displayNotes(false);
      }, 2100); // Just after the 2s animation
    },
    
    delete: async (id) => {
      // Find note in local cache
      const index = localNotesCache.findIndex(n => n.id === id);
      if (index === -1) return;
      
      // Add animation class
      const noteEl = document.querySelector(`.note-entry[data-id="${id}"]`);
      if (noteEl) {
        noteEl.classList.add('deleting');
        
        // Remove from DOM after animation
        setTimeout(() => {
          noteEl.remove();
          // Remove from local cache
          localNotesCache.splice(index, 1);
        }, 300);
      }
      
      // Delete from API in background
      api.deleteNote(id);
    }
  };

  // Editor operations
  const editor = {
    startEditing: async (noteId = null) => {
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
        const allNotes = await api.getNotes();
        const noteToEdit = allNotes.find(note => note.id === noteId);
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
        setupAutoResizeTextarea();
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
    
    saveCurrentNote: async () => {
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
          // Check if content has actually changed before updating
          const allNotes = await api.getNotes();
          const originalNote = allNotes.find(note => note.id === editorState.noteId);
          
          if (originalNote && 
              originalNote.title === title && 
              originalNote.description === description) {
            // No changes detected - ensure note is visible by refreshing display
            console.log('No changes detected, skipping update');
            editorState.hasUnsavedChanges = false;
            editor.stopEditing(); // First stop the editor
            await displayNotes(true); // Then refresh all notes to ensure visibility
            return;
          }
          
          // Content changed, update the note
          await notes.update(editorState.noteId, title, description);
        } else {
          // Create new note
          await notes.create(title, description);
        }
        
        // Close the editor
        editorState.hasUnsavedChanges = false;
        editor.stopEditing();
        
      } catch (error) {
        console.error('Error saving note:', error);
      }
    },
    
    confirmUnsavedChanges: async () => {
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
        async () => {
          if (editorState.cachedTitle) {
            try {
              if (editorState.noteId) {
                await notes.update(editorState.noteId, editorState.cachedTitle, editorState.cachedDescription);
              } else {
                await notes.create(editorState.cachedTitle, editorState.cachedDescription);
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
          displayNotes(true);
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

  // Smart updates without replacing the entire list
  function updateNotesInPlace(container, notes) {
    const existingNotes = Array.from(container.querySelectorAll('.note-entry:not(.note-entry-editor)'));
    const existingIds = existingNotes.map(el => el.getAttribute('data-id'));
    
    // Track which notes need to be added
    const toAdd = notes.filter(note => !existingIds.includes(note.id));
    
    // Track which elements need to be removed
    const toRemove = existingNotes.filter(el => 
      !notes.find(note => note.id === el.getAttribute('data-id'))
    );
    
    // Remove notes that aren't in the dataset anymore
    toRemove.forEach(el => {
      el.classList.add('deleting');
      setTimeout(() => el.remove(), 300);
    });
    
    // Create a document fragment for batch operations
    const fragment = document.createDocumentFragment();
    
    // Add new notes with animation
    toAdd.forEach(note => {
      const noteEl = dom.createNoteElement(note);
      noteEl.classList.add('inserting');
      fragment.appendChild(noteEl);
      setTimeout(() => noteEl.classList.remove('inserting'), 400);
    });
    
    // Append all new notes at once
    container.appendChild(fragment);
    
    // Update positions for existing notes
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const existingEl = container.querySelector(`.note-entry[data-id="${note.id}"]:not(.deleting)`);
      
      if (existingEl) {
        // Update content if needed
        const titleEl = existingEl.querySelector('h2');
        const descEl = existingEl.querySelector('.note-details p');
        
        if (titleEl && titleEl.textContent !== note.title) {
          titleEl.textContent = note.title;
          existingEl.classList.add('moving');
          setTimeout(() => existingEl.classList.remove('moving'), 400);
        }
        
        if (descEl && descEl.textContent !== note.description) {
          descEl.textContent = note.description;
        }
        
        // Move to correct position if needed
        const currentIndex = Array.from(container.children).indexOf(existingEl);
        if (currentIndex !== i) {
          existingEl.classList.add('moving');
          if (i === 0) {
            container.prepend(existingEl);
          } else {
            const prevSibling = container.children[i - 1];
            if (prevSibling) {
              container.insertBefore(existingEl, prevSibling.nextSibling);
            } else {
              container.appendChild(existingEl);
            }
          }
          setTimeout(() => existingEl.classList.remove('moving'), 400);
        }
      }
    }
  }

  // Display functions
  async function displayNotes(forceRefresh = false) {
    const notesArea = dom.getNotesContainer();
    if (!notesArea) return;
    
    // Only show loading on initial load or forced refresh
    if (localNotesCache.length === 0 || forceRefresh) {
      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.innerHTML = '<p>Loading notes...</p>';
      notesArea.innerHTML = '';
      notesArea.appendChild(loading);
      
      // Save editor if present
      const editorEl = notesArea.querySelector('.note-entry-editor');
      if (editorEl) editorEl.remove();
      
      try {
        // Get notes from API
        localNotesCache = await api.getNotes();
        
        // Normalize note timestamps
        localNotesCache.forEach(note => time.normalizeNote(note));
      } catch (error) {
        notesArea.innerHTML = '<div class="error-state"><p>Failed to load notes.</p></div>';
        console.error('Error displaying notes:', error);
        return;
      }
    }
    
    // Sort notes: uncompleted first, then by last edited or creation date
    localNotesCache.sort((a, b) => {
      // First sort by completion status
      if (a.isCompleted !== b.isCompleted) {
        return a.isCompleted ? 1 : -1; // Uncompleted notes first
      }
      
      // Then sort by last edited date if available
      const aTime = a.lastEdited ? a.lastEdited.timestamp : a.timestamp;
      const bTime = b.lastEdited ? b.lastEdited.timestamp : b.timestamp;
      
      // Most recent first (descending order)
      return bTime - aTime;
    });
    
    // Save editor if present
    const editorEl = notesArea.querySelector('.note-entry-editor');
    if (editorEl) editorEl.remove();
    
    // Get currently visible notes before clearing
    const currentNotes = Array.from(notesArea.querySelectorAll('.note-entry:not(.note-entry-editor)'));
    const currentNoteIds = currentNotes.map(note => note.dataset.id);
    
    // Clear the notes area, but only after loading is complete
    notesArea.innerHTML = '';
    
    if (!localNotesCache.length) {
      notesArea.innerHTML = '<div class="empty-state"><p>No notes yet.</p></div>';
      return;
    }
    
    // Add notes - but track which are new vs existing
    localNotesCache.forEach(note => {
      const noteEl = dom.createNoteElement(note);
      
      // Only add animation class for NEW notes
      if (!currentNoteIds.includes(note.id)) {
        noteEl.classList.add('inserting');
        setTimeout(() => noteEl.classList.remove('inserting'), 400);
      }
      
      notesArea.appendChild(noteEl);
    });
    
    // Restore editor if it was present
    if (editorEl) notesArea.prepend(editorEl);
    
    // Update scroll indicators
    setTimeout(() => updateScrollIndicators(notesArea), 100);
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
  async function bootstrap() {
    if (localStorage.getItem(STORAGE.INIT)) return;
    
    if (!localStorage.getItem(STORAGE.VISIT)) {
      localStorage.setItem(STORAGE.VISIT, 'true');
      
      const allNotes = await api.getNotes();
      if (allNotes.length === 0) {
        const now = time.now();
        const baseTime = time.makeTimestamp(now);
        
        await api.createNote({
          id: 'example_1',
          title: 'Welcome to Notes App',
          description: 'This is your first note!',
          ...baseTime,
          isCompleted: false
        });
        
        await api.createNote({
          id: 'example_2',
          title: 'Click to Expand',
          description: 'Notes work like spoilers - click me!',
          ...baseTime,
          isCompleted: false
        });
        
        await api.createNote({
          id: 'example_3',
          title: 'Creating New Notes',
          description: 'Use the + button to add notes.',
          ...baseTime,
          isCompleted: false
        });
      }
    }
    
    localStorage.setItem(STORAGE.INIT, 'true');
  }

  // Event handlers
  async function setupEvents() {
    const notesArea = dom.getNotesContainer();
    if (!notesArea) return;
    
    // Handle note clicks (expand/collapse)
    notesArea.addEventListener('click', async e => {
      if (modalState.changesActive || editorState.isActive) return;
      
      const noteEl = e.target.closest('.note-entry');
      if (!noteEl) return;
      
      if (e.target.closest('button')) {
        const noteId = noteEl.dataset.id;
        const btn = e.target.closest('button');
        
        if (btn.classList.contains('complete-note') || btn.classList.contains('reset-note')) {
          return await notes.toggleCompletion(noteId);
        }
        
        if (btn.classList.contains('delete-note')) {
          return await notes.delete(noteId);
        }
        
        if (btn.classList.contains('edit-note')) {
          return await editor.startEditing(noteId);
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
  document.addEventListener('DOMContentLoaded', async () => {
    await bootstrap();
    
    // Create scroll indicators
    const container = document.querySelector('.container') || document.body;
    const topIndicator = document.createElement('div');
    topIndicator.className = 'scroll-indicator scroll-indicator-top';
    const bottomIndicator = document.createElement('div');
    bottomIndicator.className = 'scroll-indicator scroll-indicator-bottom';
    
    container.appendChild(topIndicator);
    container.appendChild(bottomIndicator);
    
    // Add footer text
    const footer = document.querySelector('footer');
    if (footer) {
      const footerText = document.createElement('div');
      footerText.className = 'footer-text';
      footerText.textContent = '© 2025 Notes App';
      footer.appendChild(footerText);
    }
    
    await displayNotes();
    await setupEvents();
    
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