// Notes Application - Main Script for managing note creation, editing, display, and synchronization
import { canvas } from './canvas.js';
import { loadMarkedJS, parseMarkdown } from './markdown.js';
import { NoteCounter } from './noteCounter.js';
import { setupThemeToggle } from './theme.js';
import { api } from './api.js';
import { time } from './time.js';
import { modal } from './modal.js';
import { dom } from './dom.js';
import { syncManager } from './sync.js';
import { ANIMATION, animateNotePosition, scrollElementIntoView, cubicBezier, animateNoteMovement, captureNotePositions } from './animation.js';

const NotesManager = (() => {
  // Constants for localStorage keys
  const STORAGE = { INIT: 'notesAppInitialized', VISIT: 'hasVisitedBefore' };

  // Modal dialog state tracking
  let modalState = {
    deleteActive: false,
    changesActive: false
  };

  // State for the note editor component
  let editorState = {
    isActive: false,
    noteId: null,
    hasUnsavedChanges: false,
    cachedTitle: '',
    cachedDescription: ''
  };

  // Local cache of notes data to reduce API calls
  let localNotesCache = [];

  // Synchronization state variables
  let pendingOperations = [];
  let syncInProgress = false;
  let syncTimer = null;

  // Event handler references for proper cleanup
  let beforeUnloadHandler;
  let noteCounterUpdateHandler;
  let noteClickHandler;
  let scrollHandler;
  let topObserver;
  let bottomObserver;

  // Updates or creates the empty state message when no notes exist
  function updateEmptyState(notesArea) {
    if (!notesArea) return;

    // Remove any existing empty state
    let existingEmpty;
    const notesContainer = dom.getNotesContainer();
    if (notesContainer) {
      existingEmpty = notesContainer.querySelector('.empty-state');
    } else {
      existingEmpty = undefined;
    }
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

  // Sets up auto-resizing for the note description textarea
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

  // Core note management functionality
  const notes = {
    // Creates a new note and adds it to the local cache
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
        setTimeout(() => {
          newNoteEl.classList.remove('inserting');
        }, ANIMATION.INSERT_DURATION);
      }

      // Queue for background sync instead of immediate API call
      syncManager.addOperation('create', note.id, note);
      dispatchNotesUpdatedEvent();
      return note;
    },

    // Updates an existing note with new content
    update: async (id, title, description = '', skipAnimation = false) => {
      // Find note in local cache
      const index = localNotesCache.findIndex(n => n.id === id);
      if (index === -1) return null;

      // Get notes container reference BEFORE making changes
      const notesArea = dom.getNotesContainer();

      // Store current note positions BEFORE any changes for animation
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

      // Sort the notes by completion status and then by timestamp
      localNotesCache.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) {
          if (a.isCompleted) {
            return 1;
          } else {
            return -1;
          }
        }
        let aTime;
        if (a.lastEdited) {
          aTime = a.lastEdited.timestamp;
        } else {
          aTime = a.timestamp;
        }
        let bTime;
        if (b.lastEdited) {
          bTime = b.lastEdited.timestamp;
        } else {
          bTime = b.timestamp;
        }
        return bTime - aTime;
      });

      // Update DOM to reflect new order
      await displayNotes(false);

      // Find the edited note after DOM update
      const editedNote = notesArea.querySelector(`.note-entry[data-id="${id}"]`);

      if (!skipAnimation) {
        // Now animate ALL notes that moved
        const updatedNotesAfter = Array.from(notesArea.querySelectorAll('.note-entry:not(.note-entry-editor)'));

        updatedNotesAfter.forEach(note => {
          const noteId = note.dataset.id;
          const oldPos = positions[noteId];
          if (!oldPos) return; // Skip if no old position

          const newRect = note.getBoundingClientRect();

          // If position changed significantly, animate the transition
          if (Math.abs(oldPos.top - newRect.top) > 5) {
            // Calculate the difference - move FROM old position TO new position
            const deltaY = oldPos.top - newRect.top;

            // Different handling for the edited note vs other moved notes
            if (noteId === id) {
              // EDITED NOTE - Copy reset note animation exactly
              note.classList.add('saved');

              // Start at old position
              note.style.transform = `translateY(${deltaY}px)`;
              note.style.transition = 'none';
              note.classList.add('moving');

              // Force browser to recognize the transform before animating
              note.offsetHeight;

              // Animate to new position - EXACT SAME as toggleCompletion
              requestAnimationFrame(() => {
                note.style.transition = `transform ${ANIMATION.DURATION / 1000}s ${ANIMATION.EASING}`;
                note.style.transform = '';

                // Add rotation just like in reset animation
                note.animate([
                  { transform: `translateY(${deltaY}px) rotate(-0.5deg)` },
                  { transform: 'translateY(0) rotate(0deg)' }
                ], {
                  duration: ANIMATION.DURATION,
                  easing: ANIMATION.EASING,
                  fill: 'forwards'
                });
              });

              // Clean up with same timing as toggleCompletion
              setTimeout(() => {
                note.style.willChange = 'auto';
                note.classList.remove('moving', 'saved');
              }, ANIMATION.CLEANUP_DELAY);
            }
            else {
              // OTHER NOTES - use regular animation
              note.style.transform = `translateY(${deltaY}px)`;
              note.style.transition = 'none';
              note.classList.add('moving');
              note.style.willChange = 'transform';
              note.offsetHeight;

              requestAnimationFrame(() => {
                note.style.transition = `transform ${ANIMATION.DURATION / 1000}s ${ANIMATION.EASING}`;
                note.style.transform = '';
              });

              setTimeout(() => {
                note.style.willChange = 'auto';
              }, ANIMATION.CLEANUP_DELAY);

              setTimeout(() => {
                note.classList.remove('moving', 'editing');
              }, ANIMATION.CLEANUP_DELAY);
            }
          }
        });

        // ADD THIS: Animate scrolling to follow the edited note to its new position at the top
        if (editedNote) {
          animateNotePosition(editedNote, notesArea, false);
        }
      }

      // Queue for background sync instead of immediate API call
      syncManager.addOperation('update', id, updatedNote);
      dispatchNotesUpdatedEvent();
      return updatedNote;
    },

    // Toggles the completion status of a note
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
        if (a.isCompleted !== b.isCompleted) {
          if (a.isCompleted) {
            return 1;
          } else {
            return -1;
          }
        }
        let aTime;
        if (a.lastEdited) {
          aTime = a.lastEdited.timestamp;
        } else {
          aTime = a.timestamp;
        }
        let bTime;
        if (b.lastEdited) {
          bTime = b.lastEdited.timestamp;
        } else {
          bTime = b.timestamp;
        }
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
            if (isCompleting) {
              note.classList.add('completing');
            } else {
              note.classList.add('uncompleting');
            }
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
            note.style.transition = `transform ${ANIMATION.DURATION / 1000}s ${ANIMATION.EASING}`;
            note.style.transform = '';

            // For the target note, add some subtle rotation for emphasis
            if (note.dataset.id === id) {
              const rotateDir = isCompleting ? 0.5 : -0.5;
              note.animate([
                { transform: `translateY(${deltaY}px) rotate(${rotateDir}deg)` },
                { transform: 'translateY(0) rotate(0deg)' }
              ], {
                duration: ANIMATION.DURATION,
                easing: ANIMATION.EASING,
                fill: 'forwards'
              });
            }
          });

          // Remove will-change after animation
          setTimeout(() => {
            note.style.willChange = 'auto';
          }, ANIMATION.CLEANUP_DELAY);

          // Clean up
          setTimeout(() => {
            note.classList.remove('moving', 'completing', 'uncompleting');
            note.removeAttribute('data-completing');
            note.removeAttribute('data-uncompleting');
          }, ANIMATION.CLEANUP_DELAY);
        }
      });

      // Animate scrolling with our unified scroll animation
      animateNotePosition(targetNote, notesArea, isCompleting);

      // Queue for background sync instead of immediate API call
      syncManager.addOperation('update', id, note);
      dispatchNotesUpdatedEvent();
    },

    // Deletes a note after user confirmation
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

            // Fire the event AFTER the note is removed from the cache
            dispatchNotesUpdatedEvent();
          }, ANIMATION.DELETE_DURATION);
        }

        // Queue for background sync instead of immediate API call
        syncManager.addOperation('delete', id, null);
      });
    }
  };

  // Note editor component with all editing functionality
  const editor = {
    // Starts editing an existing note or creates a new one
    startEditing: async (noteId = null) => {
      // Don't show another editor if one is already open
      if (editorState.isActive) return;

      // Close any other expanded notes first
      dom.querySelectorAll('.note-entry.active').forEach(note => {
        note.classList.remove('active');
      });

      // Hide empty state when starting to edit
      let emptyState;
      const notesContainer = dom.getNotesContainer();
      if (notesContainer) {
        emptyState = notesContainer.querySelector('.empty-state');
      } else {
        emptyState = undefined;
      }
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
          let originalNote;
          if (noteId) {
            originalNote = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
          } else {
            originalNote = null;
          }
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
          let originalNote;
          if (noteId) {
            originalNote = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
          } else {
            originalNote = null;
          }
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

    // Stops editing and returns to normal view
    stopEditing: () => {
      let editorEl;
      const notesArea = dom.getNotesContainer();
      if (notesArea) {
        editorEl = notesArea.querySelector('.note-entry-editor');
      } else {
        editorEl = null;
      }
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

    // Saves the current note being edited
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

            // Find and re-activate the original note
            setTimeout(() => {
              const originalNoteElement = dom.querySelector(`.note-entry[data-id="${editorState.noteId}"]`);
              if (originalNoteElement) {
                originalNoteElement.classList.add('active');
                scrollElementIntoView(originalNoteElement, dom.getNotesContainer(), 20, true);
              }
            }, 50);
            return;
          }

          // IMPORTANT FIX: Save the ID before closing editor
          const savedNoteId = editorState.noteId;

          // IMPORTANT FIX: Disable the default animation in the update function
          const skipAnimation = true; // Add this flag to prevent animation in update()

          // Close editor BEFORE updating the note
          editorState.hasUnsavedChanges = false;
          editor.stopEditing();

          // IMPORTANT: Get positions AFTER editor is closed but BEFORE update
          const positions = captureNotePositions();

          // Update the note
          await notes.update(savedNoteId, title, description, skipAnimation);

          // Apply animation manually
          const updatedNoteElement = document.querySelector(`.note-entry[data-id="${savedNoteId}"]`);
          if (updatedNoteElement) {
            const oldPos = positions[savedNoteId];

            if (oldPos) {
              // Animate note movement
              animateNoteMovement(updatedNoteElement, oldPos, {
                duration: ANIMATION.DURATION,  // Use constant instead of 1000
                rotation: -0.5
              });

              // Scroll to top
              const notesArea = dom.getNotesContainer();
              requestAnimationFrame(() => {
                notesArea.scrollTop = 0;

                // Then add smooth scroll for visual effect
                setTimeout(() => {
                  notesArea.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                  });
                }, 50);
              });
            }
          }
        } else {
          // Create new note logic remains the same
          await notes.create(title, description);
        }

        // Close the editor if it was a new note
        if (!editorState.noteId) {
          editorState.hasUnsavedChanges = false;
          editor.stopEditing();
        }

      } catch (error) {
        console.error('Error saving note:', error);
      }
    },

    // Shows confirmation for discarding unsaved changes
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
          let originalNote;
          if (noteId) {
            originalNote = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
          } else {
            originalNote = null;
          }

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
                let noteAgain;
                if (noteId) {
                  noteAgain = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
                } else {
                  noteAgain = null;
                }
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

    // Sets up event listeners for the editor
    setupListeners: () => {
      const titleInput = dom.getElement('note-title-input');
      const descInput = dom.getElement('note-description-input');
      const saveBtn = dom.getElement('save-new-note');
      const cancelBtn = dom.getElement('cancel-new-note');

      // Store original values to compare against
      let originalTitle;
      if (titleInput) {
        originalTitle = titleInput.value.trim();
      } else {
        originalTitle = '';
      }
      let originalDesc;
      if (descInput) {
        originalDesc = descInput.value.trim();
      } else {
        originalDesc = '';
      }

      // Prevent form submission on Enter key
      if (titleInput) {
        titleInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
          }
        });
      }

      // Better change detection - compares against initial values
      const checkChanges = () => {
        let currentTitle;
        if (titleInput) {
          currentTitle = titleInput.value.trim();
        } else {
          currentTitle = '';
        }
        let currentDesc;
        if (descInput) {
          currentDesc = descInput.value.trim();
        } else {
          currentDesc = '';
        }
        editorState.hasUnsavedChanges =
          (currentTitle !== originalTitle || currentDesc !== originalDesc) &&
          (currentTitle.length > 0 || currentDesc.length > 0);
      };

      if (titleInput) {
        titleInput.addEventListener('input', checkChanges);
      }
      if (descInput) {
        descInput.addEventListener('input', checkChanges);
      }

      // Save button - prevent default and handle click
      if (saveBtn) {
        saveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          editor.saveCurrentNote();
        });
      }

      // Cancel button - prevent default and handle click
      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
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
                const noteAgain = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
                if (noteAgain) {
                  noteAgain.style.display = '';
                  noteAgain.classList.add('active');
                }
              }, 50);
            }
          }
        });
      }
    },

    // Prevents editor from collapsing when interacting with it
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

    // Handles clicks outside the editor (for closing)
    handleOutsideClick: e => {
      // Don't close when clicking in the editor or its children
      if (e.target.closest('.note-entry-editor') || e.target.closest('#new-note')) {
        return;
      }

      // Allow checkbox clicks to work normally
      if (e.target.type === 'checkbox') {
        // Don't prevent default for checkbox, but still handle editor dismissal
      } else {
        // Prevent default behavior for non-checkbox elements
        e.preventDefault();
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
      setTimeout(() => el.remove(), ANIMATION.DELETE_DURATION);
    });

    // Create a document fragment for batch operations
    const fragment = document.createDocumentFragment();

    // Add new notes with animation
    toAdd.forEach(note => {
      let noteEl = dom.createNoteElement(note);
      noteEl.classList.add('inserting');
      fragment.appendChild(noteEl);
      setTimeout(() => {
        noteEl.classList.remove('inserting');
      }, ANIMATION.INSERT_DURATION);
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
          setTimeout(() => existingEl.classList.remove('moving'), ANIMATION.INSERT_DURATION);
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
          setTimeout(() => existingEl.classList.remove('moving'), ANIMATION.INSERT_DURATION);
        }
      }
    }
  }

  // Displays and updates notes in the DOM
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
      let editorEl;
      if (notesArea) {
        editorEl = notesArea.querySelector('.note-entry-editor');
      } else {
        editorEl = null;
      }
      if (editorEl) {
        notesArea.prepend(editorEl);
      }

      try {
        // Get notes from API
        localNotesCache = await api.getNotes();

        // Normalize note timestamps
        localNotesCache.forEach(note => time.normalizeNote(note));
      } catch (error) {
        notesArea.innerHTML = '<div class="error-state"><p>Failed to load notes.</p></div>';
        console.error('Error displaying notes:', error);
        console.error('Failed to load notes');
        return;
      }
    }

    // Sort notes: uncompleted first, then by last edited or creation date
    localNotesCache.sort((a, b) => {
      // First sort by completion status
      if (a.isCompleted !== b.isCompleted) {
        if (a.isCompleted) {
          return 1;
        } else {
          return -1;
        }
      }

      // Then sort by last edited date if available
      let aTime;
      if (a.lastEdited) {
        aTime = a.lastEdited.timestamp;
      } else {
        aTime = a.timestamp;
      }
      let bTime;
      if (b.lastEdited) {
        bTime = b.lastEdited.timestamp;
      } else {
        bTime = b.timestamp;
      }

      // Most recent first (descending order)
      return bTime - aTime;
    });

    // Save editor if present
    let editorEl;
    if (notesArea) {
      editorEl = notesArea.querySelector('.note-entry-editor');
    } else {
      editorEl = null;
    }
    if (editorEl) {
      notesArea.prepend(editorEl);
    }

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

    // Use a for...of loop instead of forEach to allow awaiting
    for (const note of localNotesCache) {
      try {
        const noteEl = await dom.createNoteElement(note); // Wait for the element

        // Only add animation class for NEW notes
        if (!currentNoteIds.includes(note.id)) {
          noteEl.classList.add('inserting');
          setTimeout(() => {
            noteEl.classList.remove('inserting');
          }, ANIMATION.INSERT_DURATION);
        }

        notesArea.appendChild(noteEl); // Now appending actual element
      } catch (err) {
        console.error("Error creating note element:", err);
      }
    }

    // Restore editor if it was present
    if (editorEl) {
      notesArea.prepend(editorEl);
    }

    // Update scroll indicators
    setTimeout(() => updateScrollIndicators(notesArea), 100);
    dispatchNotesUpdatedEvent();
  }

  // Updates visibility of scroll indicators based on scroll position
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

  // Debounce function to limit frequency of function calls
  function debounce(func, wait = 100) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Apply debounce to resize handlers
  const debouncedLayoutUpdate = debounce(updateLayoutVariables);
  const debouncedScrollUpdate = debounce(() => {
    const notesArea = dom.getNotesContainer();
    if (notesArea) updateScrollIndicators(notesArea);
  });
  window.addEventListener('resize', debouncedLayoutUpdate);
  window.addEventListener('resize', debouncedScrollUpdate);

  // Sets up scroll indicators using IntersectionObserver for better performance
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

    // Create observers - assign to module-level variables
    topObserver = new IntersectionObserver(
      ([entry]) => topIndicator.classList.toggle('visible', !entry.isIntersecting),
      { threshold: 0 }
    );

    bottomObserver = new IntersectionObserver(
      ([entry]) => bottomIndicator.classList.toggle('visible', !entry.isIntersecting),
      { threshold: 0 }
    );
  }

  // Creates and sets up the new note button
  function initNewNoteButton() {
    const footer = document.querySelector('footer');

    // Create the button
    const newNoteBtn = document.createElement('button');
    newNoteBtn.id = 'new-note';
    newNoteBtn.textContent = '+';
    newNoteBtn.setAttribute('aria-label', 'Create new note');

    // Append to footer
    footer.appendChild(newNoteBtn);

    // Add click event listener
    newNoteBtn.addEventListener('click', () => {
      // Scroll to top first
      const notesArea = dom.getNotesContainer();
      if (notesArea) {
        if (notesArea.scrollTop > 10) {
          notesArea.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        } else {
          editor.startEditing();
        }
      }
    });
  }

  // Dispatches a custom event when notes are updated
  function dispatchNotesUpdatedEvent() {
    window.dispatchEvent(new CustomEvent('notes-updated'));
  }

  // Makes the notes cache accessible to the counter component
  window.getNotesData = function () {
    return {
      total: localNotesCache.length,
      completed: localNotesCache.filter(note => note.isCompleted).length
    };
  };

  // Initializes app with example data if first visit
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

  // Sets up event handlers for notes and UI interactions
  async function setupEvents() {
    const notesArea = dom.getNotesContainer();
    if (!notesArea) return;

    // Handle note clicks (expand/collapse)
    noteClickHandler = async function (e) {
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
    };
    notesArea.addEventListener('click', noteClickHandler);

    // New note button click
    const newNoteBtn = dom.getElement('new-note');
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', () => {
        const notesArea = dom.getNotesContainer();

        if (notesArea) {
          if (notesArea.scrollTop > 10) {
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
      scrollHandler = function () {
        updateScrollIndicators(notesArea);
      };
      notesArea.addEventListener('scroll', scrollHandler, { passive: true });

      // Update on window resize too
      window.addEventListener('resize', () => {
        updateScrollIndicators(notesArea);
      });

      // Setup IntersectionObserver-based scroll indicators
      setupScrollIndicators(notesArea);
    }
  }

  // Updates CSS variables based on header and footer dimensions
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

  // Cleans up event listeners and resources
  function destroy() {
    // Remove document-level listeners
    document.removeEventListener('click', editor.handleOutsideClick, true);

    // Remove window listeners
    window.removeEventListener('resize', updateLayoutVariables);
    window.removeEventListener('resize', debouncedLayoutUpdate);
    window.removeEventListener('resize', debouncedScrollUpdate);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    window.removeEventListener('notes-updated', noteCounterUpdateHandler);

    // Remove notes area listeners
    const notesArea = dom.getNotesContainer();
    if (notesArea) {
      notesArea.removeEventListener('click', noteClickHandler);
      notesArea.removeEventListener('scroll', scrollHandler);
    }

    // Clean up IntersectionObservers
    if (topObserver) topObserver.disconnect();
    if (bottomObserver) bottomObserver.disconnect();

    // Clear timers
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }

    if (syncManager.pendingSyncTimeout) {
      clearTimeout(syncManager.pendingSyncTimeout);
      syncManager.pendingSyncTimeout = null;
    }

    // Clear any animation frames
    if (window.scrollAnimation) {
      cancelAnimationFrame(window.scrollAnimation);
    }

    // Remove all note counter elements
    document.querySelectorAll('note-counter').forEach(counter => {
      counter.remove();
    });
  }

  // Initialize the app when DOM content is loaded
  document.addEventListener('DOMContentLoaded', async () => {
    await bootstrap();

    // Create scroll indicators
    let container = document.querySelector('.container');
    if (!container) {
      container = document.body;
    }
    const topIndicator = document.createElement('div');
    topIndicator.className = 'scroll-indicator scroll-indicator-top';
    const bottomIndicator = document.createElement('div');
    bottomIndicator.className = 'scroll-indicator scroll-indicator-bottom';

    container.appendChild(topIndicator);
    container.appendChild(bottomIndicator);

    initNewNoteButton();
    await displayNotes();
    await setupEvents();

    // Update layout variables
    updateLayoutVariables();
    window.addEventListener('resize', updateLayoutVariables);

    // Start periodic sync
    syncManager.startPeriodicSync();

    setupThemeToggle();

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let initialTheme;
    if (prefersDark) {
      initialTheme = 'dark';
    } else {
      initialTheme = 'light';
    }

    let data;
    if (window.getNotesData) {
      data = window.getNotesData();
    } else {
      data = { total: 0, completed: 0 };
    }
  });

  // Handler for beforeunload event to warn about unsaved changes
  beforeUnloadHandler = function (e) {
    let confirmationMessage;
    if (syncManager.hasPendingOperations()) {
      confirmationMessage = 'Changes are still being saved to the server. Are you sure you want to leave?';
    } else {
      confirmationMessage = 'You have unsaved changes. Are you sure you want to leave?';
    }
    e.returnValue = confirmationMessage;
    return confirmationMessage;
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  // Handler for updating note counters when notes change
  noteCounterUpdateHandler = function () {
    const counters = document.querySelectorAll('note-counter');
    counters.forEach(counter => {
      if (counter.updateCount) {
        counter.updateCount();
      }
    });
  };
  window.addEventListener('notes-updated', noteCounterUpdateHandler);

  // Public API exposed by the NotesManager module
  return {
    createNote: notes.create,
    updateNote: notes.update,
    toggleCompletion: notes.toggleCompletion,
    deleteNote: notes.delete,
    showUnsaved: modal.showUnsaved,
    showInlineNoteEditor: editor.startEditing,
    destroy,
    displayNotes,
    pendingOperations,
    syncInProgress,
    syncTimer,
    localNotesCache,
    modalState,
    editorState
  };
})();

// Make NotesManager accessible globally
window.NotesManager = NotesManager;

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', {
      scope: '/' // Important: Set scope to root to control entire site
    })
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  });
}