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

  // Add at the top of the NotesManager module
  let pendingOperations = [];
  let syncInProgress = false;
  let syncTimer = null;

  // Add this utility function for API operations
  const syncManager = {
    addOperation: function (type, id, data) {
      pendingOperations.push({ type, id, data, timestamp: Date.now() });

      // Start sync timer if not already running
      if (!syncTimer) {
        syncTimer = setInterval(this.processQueue, 5000);
      }

      // Update status indicator
      this.updateSyncStatus();
    },

    processQueue: async function () {
      if (syncInProgress || pendingOperations.length === 0) return;

      syncInProgress = true;

      try {
        // Get the oldest operation
        const operation = pendingOperations.shift();

        switch (operation.type) {
          case 'create':
            await api.createNote(operation.data);
            break;
          case 'update':
            await api.updateNote(operation.id, operation.data);
            break;
          case 'delete':
            await api.deleteNote(operation.id);
            break;
        }

        console.log(`Synced ${operation.type} operation for note ${operation.id}`);
      } catch (error) {
        console.error('Sync failed:', error);
        // Put operation back in queue to try again
        if (pendingOperations.length > 0) {
          pendingOperations.unshift(operation);
        }
      } finally {
        syncInProgress = false;

        // Clear timer if no more operations
        if (pendingOperations.length === 0) {
          clearInterval(syncTimer);
          syncTimer = null;
        }

        // Update status indicator
        this.updateSyncStatus();
      }
    },

    hasPendingOperations: function () {
      return pendingOperations.length > 0 || syncInProgress;
    },

    updateSyncStatus: function () {
      const statusEl = document.querySelector('.sync-status');
      if (!statusEl) return;

      if (this.hasPendingOperations()) {
        statusEl.textContent = `Syncing ${pendingOperations.length} changes...`;
        statusEl.classList.add('syncing');
      } else {
        statusEl.textContent = 'All changes saved';
        statusEl.classList.remove('syncing');

        // Hide after 2 seconds
        setTimeout(() => {
          statusEl.textContent = '';
        }, 2000);
      }
    }
  };

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
    },
    generateId: () => `note_${Date.now()}`
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
            ${buttons.map(b => `<button id="${b.id}" class="${b.cls}" 
              ${b.ariaLabel ? `aria-label="${b.ariaLabel}"` : ''}>${b.text}</button>`).join('')}
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
            onClick: (e) => {
              // Prevent default event behavior
              e.preventDefault();

              modal.hide('unsaved-modal');
              modalState.changesActive = false;
              setTimeout(onDiscard, 0);
            }
          },
          {
            id: 'unsave-ok',
            text: 'Save',
            cls: 'primary-button',
            onClick: async (e) => {
              // Prevent default event behavior
              e.preventDefault();

              if (editorState.cachedTitle) {
                try {
                  modal.hide('unsaved-modal'); // Hide modal first
                  modalState.changesActive = false; // Reset modal state

                  if (id) {
                    await notes.update(id, editorState.cachedTitle, editorState.cachedDescription);
                  } else {
                    await notes.create(editorState.cachedTitle, editorState.cachedDescription);
                  }
                  editorState.hasUnsavedChanges = false;
                  editor.stopEditing();
                } catch (error) {
                  console.error('Error saving note:', error);
                  editorState.hasUnsavedChanges = false;
                  editor.stopEditing();
                }
              } else {
                modal.hide('unsaved-modal');
                modalState.changesActive = false;
                editorState.hasUnsavedChanges = false;
                editor.stopEditing();
              }
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
            ariaLabel: 'Cancel deletion',
            onClick: () => {
              modal.hide('delete-modal');
              modalState.deleteActive = false;
            }
          },
          {
            id: 'del-ok',
            text: 'Delete',
            cls: 'warning-button',
            ariaLabel: 'Confirm deletion',
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
              <button class="${note.isCompleted ? 'reset-note' : 'complete-note'}" 
                aria-label="${note.isCompleted ? 'Mark as incomplete' : 'Mark as complete'}"></button>
              <button class="edit-note" aria-label="Edit note"></button>
              <button class="delete-note" aria-label="Delete note"></button>
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
            <button id="save-new-note" type="button" aria-label="Save note"></button>
            <button id="cancel-new-note" type="button" aria-label="Cancel editing"></button>
          </div>
        </div>
      `;

      return editorNote;
    }
  };

  // Add this helper function after the dom helper methods
  function updateEmptyState(notesArea) {
    if (!notesArea) return;

    // Remove any existing empty state
    const existingEmpty = notesArea.querySelector('.empty-state');
    if (existingEmpty) {
      existingEmpty.remove();
    }

    // Show empty state if we have no notes and aren't currently editing
    if (localNotesCache.length === 0 && !editorState.isActive) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = '<p>No notes yet.<br>Click + to add one!</p>';
      notesArea.appendChild(emptyState);
    }
  }

  // Unified animation system for note movements
  function animateNotePosition(note, notesArea, isCompleting) {
    if (!note || !notesArea) return;

    // Calculate scroll target based on note position - always center it
    const noteRect = note.getBoundingClientRect();
    const containerRect = notesArea.getBoundingClientRect();
    const viewportCenter = containerRect.height / 2;
    const noteCenter = noteRect.top + (noteRect.height / 2) - containerRect.top;
    const targetScroll = notesArea.scrollTop + (noteCenter - viewportCenter);

    // Initial position
    const startPosition = notesArea.scrollTop;
    const totalScrollNeeded = targetScroll - startPosition;

    // NEW: Don't animate if scroll distance is too small (less than 10px)
    if (Math.abs(totalScrollNeeded) < 10) {
      return;
    }

    // Match exactly with CSS transition speed (1s)
    const startTime = performance.now();
    const duration = 1000; // Match with the note animation (1s)

    // Cancel any existing animations
    if (window.scrollAnimation) {
      cancelAnimationFrame(window.scrollAnimation);
    }

    // Use LINEAR timing for consistent speed with no acceleration/deceleration
    function step(timestamp) {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Linear timing - replace cubic-bezier with simple linear animation
      notesArea.scrollTop = startPosition + (totalScrollNeeded * progress);

      if (progress < 1) {
        window.scrollAnimation = requestAnimationFrame(step);
      }
    }

    // Start animation
    window.scrollAnimation = requestAnimationFrame(step);
  }

  // Also update scrollElementIntoView for consistent behavior
  function scrollElementIntoView(element, container, additionalOffset = 0, centerElement = false) {
    if (!element || !container) return;

    // Get the bounding rectangles
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate the scroll target
    let targetScroll;

    if (centerElement) {
      // Center the element in the container
      const elementCenter = elementRect.top + (elementRect.height / 2);
      const containerCenter = containerRect.top + (containerRect.height / 2);
      targetScroll = container.scrollTop + (elementCenter - containerCenter);

      // NEW: Don't scroll if element is already within 10px of center
      if (Math.abs(elementCenter - containerCenter) < 10) {
        return;
      }
    } else {
      // Just make sure element is visible
      if (elementRect.top < containerRect.top) {
        // Element is above viewport
        targetScroll = container.scrollTop - (containerRect.top - elementRect.top) - additionalOffset;
      } else if (elementRect.bottom > containerRect.bottom) {
        // Element is below viewport
        targetScroll = container.scrollTop + (elementRect.bottom - containerRect.bottom) + additionalOffset;
      } else {
        // Already visible
        return;
      }
    }

    // Perform the scroll with smooth animation
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  }

  // Add this function around line 863
  function setupAutoResizeTextarea() {
    const textarea = dom.getElement('note-description-input');
    if (!textarea) return;

    // Set initial height
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';

    // Add resize on input
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
  }

  // Note operations
  const notes = {
    create: async (title, description = '') => {
      const note = {
        id: time.generateId(),
        title,
        description,
        ...time.makeTimestamp(time.now()),
        isCompleted: false
      };

      // Add to local cache at the beginning
      localNotesCache.unshift(note);

      // Update DOM
      await displayNotes(false);

      // Find the newly created note and add animation
      const notesArea = dom.getNotesContainer();
      const newNoteEl = notesArea.querySelector(`.note-entry[data-id="${note.id}"]`);
      if (newNoteEl) {
        newNoteEl.classList.add('inserting');
        setTimeout(() => newNoteEl.classList.remove('inserting'), 500);
      }

      // Queue for background sync instead of immediate API call
      syncManager.addOperation('create', note.id, note);
      return note;
    },

    update: async (id, title, description = '') => {
      // Find note in local cache
      const index = localNotesCache.findIndex(n => n.id === id);
      if (index === -1) return null;

      // Get notes container reference BEFORE making changes
      const notesArea = dom.getNotesContainer();

      // Store current note positions BEFORE any changes
      const positions = {};
      const updatedNotes = Array.from(notesArea.querySelectorAll('.note-entry:not(.note-entry-editor)'));
      updatedNotes.forEach(note => {
        const rect = note.getBoundingClientRect();
        positions[note.dataset.id] = {
          top: rect.top,
          left: rect.left
        };
      });

      // Update local cache first
      const updatedNote = {
        ...localNotesCache[index],
        title,
        description,
        lastEdited: time.makeTimestamp(time.now())
      };

      // Add editing class to the note being edited
      const targetNote = updatedNotes.find(note => note.dataset.id === id);
      if (targetNote) {
        targetNote.classList.add('editing');
      }

      // Update model & sort
      localNotesCache[index] = updatedNote;

      // Sort the notes
      localNotesCache.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) {
          return a.isCompleted ? 1 : -1;
        }
        const aTime = a.lastEdited ? a.lastEdited.timestamp : a.timestamp;
        const bTime = b.lastEdited ? b.lastEdited.timestamp : b.timestamp;
        return bTime - aTime;
      });

      // Update DOM to reflect new order
      await displayNotes(false);

      // Find the edited note after DOM update
      const editedNote = notesArea.querySelector(`.note-entry[data-id="${id}"]`);

      // Now animate ALL notes that moved
      const updatedNotesAfter = Array.from(notesArea.querySelectorAll('.note-entry:not(.note-entry-editor)'));

      updatedNotesAfter.forEach(note => {
        const id = note.dataset.id;
        const oldPos = positions[id];
        if (!oldPos) return; // Skip if no old position

        const newRect = note.getBoundingClientRect();

        // If position changed significantly, animate the transition
        if (Math.abs(oldPos.top - newRect.top) > 5) {
          // Calculate the difference - move FROM old position TO new position
          const deltaY = oldPos.top - newRect.top;

          // Start at the old position
          note.style.transform = `translateY(${deltaY}px)`;
          note.style.transition = 'none';
          note.classList.add('moving');

          // Add will-change hint before animations start
          note.style.willChange = 'transform';

          // Force browser to recognize the transform before animating
          note.offsetHeight;

          // Animate to new position
          requestAnimationFrame(() => {
            note.style.transition = 'transform 1s linear';
            note.style.transform = '';
          });

          // Remove will-change after animation
          setTimeout(() => {
            note.style.willChange = 'auto';
          }, 1100);

          // Clean up
          setTimeout(() => {
            note.classList.remove('moving', 'editing');
          }, 1100);
        }
      });

      // ADD THIS: Animate scrolling to follow the edited note to its new position at the top
      if (editedNote) {
        // Animation to scroll to the top of the list
        animateNotePosition(editedNote, notesArea, false);
      }

      // Queue for background sync instead of immediate API call
      syncManager.addOperation('update', id, updatedNote);
      return updatedNote;
    },

    toggleCompletion: async (id) => {
      // Find note in local cache
      const index = localNotesCache.findIndex(n => n.id === id);
      if (index === -1) return;

      const notesArea = dom.getNotesContainer();

      // Record positions BEFORE making any changes
      const positions = {};
      const updatedNotes = Array.from(notesArea.querySelectorAll('.note-entry:not(.note-entry-editor)'));
      updatedNotes.forEach(note => {
        const rect = note.getBoundingClientRect();
        positions[note.dataset.id] = {
          top: rect.top,
          left: rect.left
        };
      });

      // Update the note status
      const note = { ...localNotesCache[index] };
      const isCompleting = !note.isCompleted;
      note.isCompleted = isCompleting;

      // Update timestamp for completion status
      if (isCompleting) {
        note.completedAt = time.makeTimestamp(time.now());
      } else {
        delete note.completedAt;
      }

      // Update model and sort
      localNotesCache[index] = note;
      localNotesCache.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        const aTime = a.lastEdited ? a.lastEdited.timestamp : a.timestamp;
        const bTime = b.lastEdited ? b.lastEdited.timestamp : b.timestamp;
        return bTime - aTime;
      });

      // Update DOM - first update the display without animation
      await displayNotes(false);

      // Find target note after DOM update
      const targetNote = notesArea.querySelector(`.note-entry[data-id="${id}"]`);
      if (!targetNote) return;

      // Add animation attributes based on completion state
      if (isCompleting) {
        targetNote.setAttribute('data-completing', 'true');
      } else {
        targetNote.setAttribute('data-uncompleting', 'true');
      }

      // Now animate ALL notes that moved
      const updatedNotesAfter = Array.from(notesArea.querySelectorAll('.note-entry:not(.note-entry-editor)'));
      updatedNotesAfter.forEach(note => {
        const id = note.dataset.id;
        const oldPos = positions[id];
        if (!oldPos) return; // Skip if no old position

        const newRect = note.getBoundingClientRect();

        // Only animate if position changed significantly
        if (Math.abs(oldPos.top - newRect.top) > 5) {
          const deltaY = oldPos.top - newRect.top;

          // Add appropriate animation class
          if (note.dataset.id === id) {
            note.classList.add(isCompleting ? 'completing' : 'uncompleting');
          }

          // Start at old position
          note.style.transform = `translateY(${deltaY}px)`;
          note.style.transition = 'none';
          note.classList.add('moving');

          // Add will-change hint before animations start
          note.style.willChange = 'transform';

          // Force reflow
          note.offsetHeight;

          // Animate to new position - sync with scroll animation duration
          requestAnimationFrame(() => {
            note.style.transition = 'transform 1.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
            note.style.transform = '';

            // For the target note, add some subtle rotation for emphasis
            if (note.dataset.id === id) {
              const rotateDir = isCompleting ? 0.5 : -0.5;
              note.animate([
                { transform: `translateY(${deltaY}px) rotate(${rotateDir}deg)` },
                { transform: 'translateY(0) rotate(0deg)' }
              ], {
                duration: 1500,
                easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
                fill: 'forwards'
              });
            }
          });

          // Remove will-change after animation
          setTimeout(() => {
            note.style.willChange = 'auto';
          }, 1600);

          // Clean up
          setTimeout(() => {
            note.classList.remove('moving', 'completing', 'uncompleting');
            note.removeAttribute('data-completing');
            note.removeAttribute('data-uncompleting');
          }, 1600);
        }
      });

      // Animate scrolling with our unified scroll animation
      animateNotePosition(targetNote, notesArea, isCompleting);

      // Queue for background sync instead of immediate API call
      syncManager.addOperation('update', id, note);
    },

    delete: async (id) => {
      modal.showDeleteConfirm(id, async () => {
        // This will only run if the user confirms deletion

        // Find note in local cache
        const index = localNotesCache.findIndex(n => n.id === id);
        if (index === -1) return;

        // Get the note element
        const noteEl = document.querySelector(`.note-entry[data-id="${id}"]`);
        if (noteEl) {
          // Add delete animation
          noteEl.classList.add('deleting');

          setTimeout(() => {
            noteEl.remove();
            // Remove from local cache
            localNotesCache.splice(index, 1);

            // Show empty state if this was the last note
            if (localNotesCache.length === 0) {
              const notesArea = dom.getNotesContainer();
              updateEmptyState(notesArea);
            }
          }, 300);
        }

        // Queue for background sync instead of immediate API call
        syncManager.addOperation('delete', id, null);
      });
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

      // Hide empty state when starting to edit
      const emptyState = dom.getNotesContainer()?.querySelector('.empty-state');
      if (emptyState) {
        emptyState.remove();
      }

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
      const noteId = editorState.noteId; // Save ID before resetting state

      // If we were editing an existing note, get reference BEFORE manipulating DOM
      let originalNote = null;
      if (noteId) {
        originalNote = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
        if (originalNote && originalNote !== editorEl) {
          // Mark for keeping track
          originalNote.setAttribute('data-restore', 'true');
        }
      }

      // Remove the editor
      if (editorEl && editorEl.parentNode) {
        editorEl.parentNode.removeChild(editorEl);
      }

      // Reset state
      editorState.isActive = false;
      editorState.noteId = null;

      // Force note to be visible with a slight delay to ensure DOM operations complete
      if (noteId) {
        // Use a more robust selector that works even if DOM was refreshed
        setTimeout(() => {
          const noteToRestore = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
          if (noteToRestore) {
            noteToRestore.style.display = '';
            noteToRestore.classList.add('active');
            noteToRestore.removeAttribute('data-restore');

            // Also ensure it's visible in the viewport
            scrollElementIntoView(noteToRestore, dom.getNotesContainer(), 20, true);
          }
        }, 50);
      }

      editorState.hasUnsavedChanges = false;

      // Check if we need to restore empty state after editing
      if (localNotesCache.length === 0) {
        const notesArea = dom.getNotesContainer();
        if (notesArea) {
          updateEmptyState(notesArea);
        }
      }
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
            // No changes detected - just close editor and keep note open
            console.log('No changes detected, keeping note open');
            editorState.hasUnsavedChanges = false;
            editor.stopEditing();

            // Find and re-activate the original note instead of refreshing
            setTimeout(() => {
              const originalNoteElement = dom.querySelector(`.note-entry[data-id="${editorState.noteId}"]`);
              if (originalNoteElement) {
                originalNoteElement.classList.add('active');
                // Center it in the viewport
                scrollElementIntoView(originalNoteElement, dom.getNotesContainer(), 20, true);
              }
            }, 50);
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

      // Cache the note ID before showing modal 
      const noteId = editorState.noteId;

      // Use modal system
      modal.showUnsaved(
        editorState.noteId,
        // Save callback - unchanged
        async () => {
          // Existing save code...
        },
        // Discard callback - FIXED TO PREVENT NOTE DISAPPEARING
        () => {
          // Get current scroll position
          const notesArea = dom.getNotesContainer();
          const currentScrollPosition = notesArea ? notesArea.scrollTop : 0;

          // IMPORTANT: Store note reference BEFORE stopping editing
          const originalNote = noteId ? dom.querySelector(`.note-entry[data-id="${noteId}"]`) : null;

          // Clear editor state
          editorState.hasUnsavedChanges = false;
          editor.stopEditing();

          // Force the original note to be visible immediately
          if (originalNote) {
            originalNote.style.display = '';
            originalNote.classList.add('active');
          }

          // Restore scroll position and ensure note is shown
          setTimeout(() => {
            if (notesArea) {
              notesArea.scrollTop = currentScrollPosition;

              // Double-check the note is visible after a delay
              if (noteId) {
                const noteAgain = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
                if (noteAgain) {
                  noteAgain.style.display = '';
                  noteAgain.classList.add('active');
                }
              }
            }
          }, 50);
        }
      );
    },

    setupListeners: () => {
      const titleInput = dom.getElement('note-title-input');
      const descInput = dom.getElement('note-description-input');
      const saveBtn = dom.getElement('save-new-note');
      const cancelBtn = dom.getElement('cancel-new-note');

      // Store original values to compare against
      let originalTitle = titleInput ? titleInput.value.trim() : '';
      let originalDesc = descInput ? descInput.value.trim() : '';

      // Prevent form submission on Enter key
      titleInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
        }
      });

      // Better change detection - compares against initial values
      const checkChanges = () => {
        const currentTitle = titleInput ? titleInput.value.trim() : '';
        const currentDesc = descInput ? descInput.value.trim() : '';

        // Note is changed if either field is different from original
        editorState.hasUnsavedChanges =
          (currentTitle !== originalTitle || currentDesc !== originalDesc) &&
          (currentTitle.length > 0 || currentDesc.length > 0);
      };

      titleInput?.addEventListener('input', checkChanges);
      descInput?.addEventListener('input', checkChanges);

      // Save button - prevent default and handle click
      saveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        editor.saveCurrentNote();
      });

      // Cancel button - prevent default and handle click
      cancelBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (editorState.hasUnsavedChanges) {
          editor.confirmUnsavedChanges();
        } else {
          // Get the ID before stopping edit
          const noteId = editorState.noteId;

          // Then simply stop editing - the improved stopEditing handles the rest
          editor.stopEditing();

          // Additional safety check - force visibility after a delay
          if (noteId) {
            setTimeout(() => {
              const originalNote = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
              if (originalNote) {
                originalNote.style.display = '';
                originalNote.classList.add('active');
              }
            }, 100);
          }
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

      // Prevent default behavior
      e.preventDefault();

      // If we're editing and modal isn't active, handle outside click
      if (editorState.isActive && !modalState.changesActive) {
        if (editorState.hasUnsavedChanges) {
          editor.confirmUnsavedChanges();
        } else {
          editor.stopEditing();
          // Don't call displayNotes() here to avoid refreshing
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
      loading.innerHTML = ''; // Empty loading indicator without text 
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
      notesArea.innerHTML = '';
      // Only show empty state if we're not editing
      if (!editorState.isActive) {
        updateEmptyState(notesArea);
      }
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

  // Add these optimization techniques

  // 1. Debounce window resize events
  function debounce(func, wait = 100) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Apply debounce to resize handlers
  window.addEventListener('resize', debounce(updateLayoutVariables));
  window.addEventListener('resize', debounce(() => {
    const notesArea = dom.getNotesContainer();
    if (notesArea) updateScrollIndicators(notesArea);
  }));

  // 2. Use IntersectionObserver for better scroll indicators
  function setupScrollIndicators(notesArea) {
    const topIndicator = document.querySelector('.scroll-indicator-top');
    const bottomIndicator = document.querySelector('.scroll-indicator-bottom');

    if (!topIndicator || !bottomIndicator || !notesArea) return;

    // Create sentinel elements
    const topSentinel = document.createElement('div');
    const bottomSentinel = document.createElement('div');

    topSentinel.className = 'scroll-sentinel top-sentinel';
    bottomSentinel.className = 'scroll-sentinel bottom-sentinel';

    notesArea.prepend(topSentinel);
    notesArea.append(bottomSentinel);

    // Create observers
    const topObserver = new IntersectionObserver(
      ([entry]) => topIndicator.classList.toggle('visible', !entry.isIntersecting),
      { threshold: 0 }
    );

    const bottomObserver = new IntersectionObserver(
      ([entry]) => bottomIndicator.classList.toggle('visible', !entry.isIntersecting),
      { threshold: 0 }
    );

    topObserver.observe(topSentinel);
    bottomObserver.observe(bottomSentinel);
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
        // Button handling remains unchanged
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

      // Check if click was in the description area of an active note
      if (noteEl.classList.contains('active') && e.target.closest('.note-details')) {
        // If clicked in description area of an active note, do nothing (don't toggle)
        return;
      }

      // Handle title area clicks and clicks on inactive notes
      const wasActive = noteEl.classList.contains('active');
      notesArea.querySelectorAll('.note-entry.active').forEach(n => n.classList.remove('active'));

      if (!wasActive) {
        noteEl.classList.add('active');

        // Give time for expansion animation to start before scrolling
        setTimeout(() => {
          // Center the expanded note in viewport code (unchanged)
          const noteRect = noteEl.getBoundingClientRect();
          const containerRect = notesArea.getBoundingClientRect();
          const noteCenter = noteRect.top + (noteRect.height / 2);
          const containerCenter = containerRect.top + (containerRect.height / 2);
          const scrollOffset = noteCenter - containerCenter;

          // Smooth scroll to center the note
          notesArea.scrollBy({
            top: scrollOffset,
            behavior: 'smooth'
          });
        }, 100);
      }
    });

    // New note button click
    const newNoteBtn = dom.getElement('new-note');
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', () => {
        const notesArea = dom.getNotesContainer();

        if (notesArea && notesArea.scrollTop > 10) {
          // Animate scroll to top before showing editor
          const startPosition = notesArea.scrollTop;
          const startTime = performance.now();
          const duration = 500; // 500ms for a quick but smooth scroll

          // Use animation frame for smooth scrolling
          function scrollStep(timestamp) {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic function for natural slowing at the end
            const easeOutCubic = 1 - Math.pow(1 - progress, 3);

            // Calculate new scroll position
            notesArea.scrollTop = startPosition * (1 - easeOutCubic);

            if (progress < 1) {
              requestAnimationFrame(scrollStep);
            } else {
              // Once scrolling is complete, open the editor
              editor.startEditing();
            }
          }

          // Start the animation
          requestAnimationFrame(scrollStep);
        } else {
          // Already at the top, just open editor immediately
          editor.startEditing();
        }
      });
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

      // Setup IntersectionObserver-based scroll indicators
      setupScrollIndicators(notesArea);
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

  // Update the beforeunload handler to check for pending operations
  window.addEventListener('beforeunload', function (e) {
    // Check for unsaved editor changes OR pending operations
    if ((editorState.isActive && editorState.hasUnsavedChanges) ||
      syncManager.hasPendingOperations()) {

      const confirmationMessage = syncManager.hasPendingOperations()
        ? 'Changes are still being saved to the server. Are you sure you want to leave?'
        : 'You have unsaved changes. Are you sure you want to leave?';

      e.returnValue = confirmationMessage;
      return confirmationMessage;
    }
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

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  });
}