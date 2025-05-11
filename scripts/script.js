class NoteCounter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    window.addEventListener('notes-updated', () => this.updateCount());
    this.updateCount();
  }

  updateCount() {
    const data = window.getNotesData ? window.getNotesData() : {total: 0, completed: 0};
    this.shadowRoot.querySelector('.counter').textContent = `(${data.completed}/${data.total})`;
  }

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

customElements.define('note-counter', NoteCounter);

const NotesManager = (() => {
  const API_URL = 'https://67f5684b913986b16fa476f9.mockapi.io/api/onion/NoteTaking';
  const STORAGE = { INIT: 'notesAppInitialized', VISIT: 'hasVisitedBefore' };

  // Add this function at the top of your module
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Dynamically loads the Marked.js library
   * @returns {Promise} Resolves when script is loaded
   */
  function loadMarkedJS() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.marked) {
        resolve(window.marked);
        return;
      }
      
      console.log('Loading Marked.js dynamically');
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
      script.async = true;
      
      script.onload = () => {
        console.log('Marked.js loaded successfully');
        resolve(window.marked);
      };
      
      script.onerror = () => {
        const error = new Error('Failed to load Marked.js');
        console.error(error);
        reject(error);
      };
      
      document.head.appendChild(script);
    });
  }

  /**
   * Parses markdown text to HTML
   * @param {string} text - Markdown text to parse
   * @returns {Promise<string>} - Parsed HTML
   */
  async function parseMarkdown(text) {
    if (!text) return 'No description provided.';
    
    try {
      // Ensure library is loaded
      await loadMarkedJS();
      
      // Now we can safely use marked
      return marked.parse(text);
    } catch (error) {
      console.error('Error parsing markdown:', error);
      return text; // Fallback to plain text
    }
  }

  // Updated setupThemeToggle function
  function setupThemeToggle() {
    const themeToggle = document.querySelector('.theme-checkbox');
    if (!themeToggle) return;
    
    // Set initial state based on saved preference or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // If theme was saved before, use it
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      themeToggle.checked = savedTheme === 'dark'; // Checked = dark now
    } else {
      // Otherwise use system preference (default to light)
      const initialTheme = prefersDark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', initialTheme);
      themeToggle.checked = initialTheme === 'dark'; // Checked = dark now
    }
    
    // Handle toggle changes (checked now means dark theme)
    themeToggle.addEventListener('change', function() {
      const newTheme = this.checked ? 'dark' : 'light'; // Reversed from original
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      
      // Update theme-color meta tag
      const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])');
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', 
          newTheme === 'dark' ? '#1a1a1a' : '#f5f5f5'
        );
      }
      
      // Add class for smooth transition
      document.body.classList.add('theme-transition');
      setTimeout(() => {
        document.body.classList.remove('theme-transition');
      }, 1000);
    });
  }

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

  // Replace the current syncManager implementation with this:
  const syncManager = {
    // Track last full sync time
    lastFullSyncTime: Date.now(),
    pendingSyncTimeout: null,
    
    addOperation: function (type, id, data) {
      pendingOperations.push({ type, id, data, timestamp: Date.now() });

      // Clear any existing pending sync timeout
      if (this.pendingSyncTimeout) {
        clearTimeout(this.pendingSyncTimeout);
      }
      
      // Set a new timeout for 5 seconds after operation
      this.pendingSyncTimeout = setTimeout(() => {
        this.fullSync();
      }, 5000);

      // Update status indicator
      this.updateSyncStatus();
    },
    
    // Full sync: process outgoing changes AND pull server changes
    fullSync: async function() {
      console.log("Running full sync...");
      
      // Process any pending outgoing operations first
      if (pendingOperations.length > 0) {
        try {
          await this.processQueue();
        } catch (error) {
          console.error("Error processing outgoing changes:", error);
        }
      }
      
      // Then pull fresh data from server
      try {
        console.log("Pulling updates from server...");
        const serverNotes = await api.getNotes();
        
        // Only update if there are differences
        if (this.hasChangesFromServer(serverNotes)) {
          // Update local cache with server data
          localNotesCache = serverNotes;
          localNotesCache.forEach(note => time.normalizeNote(note));
          
          // Update the UI
          await displayNotes(false);
          console.log("UI updated with server changes");
        } else {
          console.log("No changes from server detected");
        }
      } catch (error) {
        console.error("Error pulling updates from server:", error);
      }
      
      // Update last sync time
      this.lastFullSyncTime = Date.now();
      this.updateSyncStatus();
    },
    
    // Check if server has changes we don't have locally
    hasChangesFromServer: function(serverNotes) {
      if (serverNotes.length !== localNotesCache.length) return true;
      
      // Simple comparison - checks if any notes differ
      const serverIds = serverNotes.map(note => note.id).sort();
      const localIds = localNotesCache.map(note => note.id).sort();
      
      // If IDs don't match, something changed
      if (JSON.stringify(serverIds) !== JSON.stringify(localIds)) return true;
      
      // Check if any note contents changed
      for (const serverNote of serverNotes) {
        const localNote = localNotesCache.find(note => note.id === serverNote.id);
        if (!localNote) return true;
        
        // Compare important fields
        if (serverNote.title !== localNote.title ||
            serverNote.description !== localNote.description ||
            serverNote.isCompleted !== localNote.isCompleted) {
          return true;
        }
      }
      
      return false;
    },

    // Process outgoing operations queue (existing code with minor updates)
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
        
        // If more operations remain, continue processing
        if (pendingOperations.length > 0) {
          setTimeout(() => this.processQueue(), 100);
        }
        
        // Update status indicator
        this.updateSyncStatus();
      }
    },

    // Start the 30-second background sync
    startPeriodicSync: function() {
      // Clear any existing sync timer
      if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
      }
      
      // Create new timer for 30 second intervals
      syncTimer = setInterval(() => this.fullSync(), 30000);
      console.log("Started periodic 30-second sync");
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
          if (statusEl.textContent === 'All changes saved') {
            statusEl.textContent = '';
          }
        }, 2000);
      }
    },

    // Emergency sync remains the same
    emergencySync: async function() { /* Same as before */ }
  };

  // Add animation constants
  const ANIMATION = {
    DURATION: 1500,    // 1.5 seconds for all animations
    EASING: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    CLEANUP_DELAY: 1600,  // Duration + 100ms buffer
    INSERT_DURATION: 500,
    DELETE_DURATION: 300
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
        showToast('Failed to create note', 'error');
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
        
        // Try emergency sync immediately when an update fails
        setTimeout(async () => {
          await syncManager.emergencySync();
        }, 1000);
        
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
        showToast('Failed to delete note', 'error');
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
    show: (id) => { 
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.add('active');
      } else {
        console.error(`Modal with id "${id}" not found`);
      }
    },
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
                  showToast('Failed to save note', 'error');
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
    getNotesContainer: () => document.querySelector('main'),
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

    createNoteElement: async function(note) {
      // Create the element structure
      const el = document.createElement('div');
      el.className = `note-entry${note.isCompleted ? ' completed-note' : ''}`;
      el.dataset.id = note.id;
      
      // Parse markdown content (with our new function)
      const parsedContent = await parseMarkdown(note.description);
      
      el.innerHTML = `
        <div class="note-title">
          <div class="title-container">
            <h2>${note.title}</h2>
            <p>🗓️ ${note.date} @ ${note.time}</p>
          </div>
          ${note.isCompleted ? '<canvas class="completion-indicator" width="24" height="24"></canvas>' : ''}
        </div>
        <div class="note-details">
          <div class="markdown-content">
            ${parsedContent}
          </div>
          <div class="button-row">
            <div>
              ${note.lastEdited ? `<div class="edit-info">✏️ ${note.lastEdited.date} @ ${note.lastEdited.time}</div>` : ''}
              ${note.isCompleted && note.completedAt ? `<div class="completion-info">✅ ${note.completedAt.date} @ ${note.completedAt.time}</div>` : ''}
            </div>
            <div class="action-buttons">
              <button class="${note.isCompleted ? 'reset-note' : 'complete-note'}" 
                aria-label="${note.isCompleted ? 'Mark as incomplete' : 'Mark as complete'}"></button>
              <button class="edit-note" aria-label="Edit note"></button>
              <button class="delete-note" aria-label="Delete note"></button>
            </div>
          </div>
        </div>`;

      // Draw completion indicator (keep your existing code)
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

  // Add this cubic-bezier helper function to your code
  function cubicBezier(p0, p1, p2, p3, t) {
    const term1 = 3 * p1 * t * (1 - t) * (1 - t);
    const term2 = 3 * p2 * t * t * (1 - t);
    const term3 = p3 * t * t * t;
    return term1 + term2 + term3;
  }

  // Add this function to your code (near other utility functions)
  function animateNoteMovement(note, oldPosition, options = {}) {
    // Default options
    const defaults = {
      duration: 1500,  // Match the 1.5s animation time from toggleCompletion
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      rotation: -0.5,  // Slight rotation for visual interest
      addRotation: true
    };
    
    const settings = {...defaults, ...options};
    const newPosition = note.getBoundingClientRect();
    
    // Calculate movement - if too small, use minimum movement
    const deltaY = Math.abs(oldPosition.top - newPosition.top) > 5 
      ? oldPosition.top - newPosition.top
      : 40; // Minimum movement for visibility
    
    // Add relevant classes
    note.classList.add('moving');
    note.style.willChange = 'transform';
    
    // Start at old position
    note.style.transform = `translateY(${deltaY}px)`;
    note.style.transition = 'none';
    
    // Force reflow
    note.offsetHeight;
    
    // Animate to new position
    requestAnimationFrame(() => {
      note.style.transition = `transform ${settings.duration/1000}s ${settings.easing}`;
      note.style.transform = '';
      
      // Add rotation if specified
      if (settings.addRotation) {
        note.animate([
          { transform: `translateY(${deltaY}px) rotate(${settings.rotation}deg)` },
          { transform: 'translateY(0) rotate(0deg)' }
        ], {
          duration: settings.duration,
          easing: settings.easing,
          fill: 'forwards'
        });
      }
    });
    
    // Clean up
    setTimeout(() => {
      note.style.willChange = 'auto';
      note.classList.remove('moving', 'saved');
    }, ANIMATION.CLEANUP_DELAY);
    
    return deltaY;
  }

  // Add this function to capture positions before DOM changes
  function captureNotePositions(selector = '.note-entry:not(.note-entry-editor)', collectSize = false) {
    const positions = {};
    const notes = Array.from(document.querySelectorAll(selector));
    
    notes.forEach(note => {
      const noteId = note.dataset.id;
      if (noteId) {
        const rect = note.getBoundingClientRect();
        positions[noteId] = {
          top: rect.top,
          left: rect.left
        };
        
        // Only collect size if needed
        if (collectSize) {
          positions[noteId].width = rect.width;
          positions[noteId].height = rect.height;
        }
      }
    });
    
    return positions;
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
        setTimeout(() => newNoteEl.classList.remove('inserting'), ANIMATION.INSERT_DURATION);
      }

      // Queue for background sync instead of immediate API call
      syncManager.addOperation('create', note.id, note);
      dispatchNotesUpdatedEvent();
      return note;
    },

    update: async (id, title, description = '', skipAnimation = false) => {
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
                note.style.transition = `transform ${ANIMATION.DURATION/1000}s ${ANIMATION.EASING}`;
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
                note.style.transition = `transform ${ANIMATION.DURATION/1000}s ${ANIMATION.EASING}`;
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
          // Animation to scroll to the top of the list
          animateNotePosition(editedNote, notesArea, false);
        }
      }

      // Queue for background sync instead of immediate API call
      syncManager.addOperation('update', id, updatedNote);
      dispatchNotesUpdatedEvent();
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
            note.style.transition = `transform ${ANIMATION.DURATION/1000}s ${ANIMATION.EASING}`;
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
        showToast('Failed to save note', 'error');
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
              const noteAgain = dom.querySelector(`.note-entry[data-id="${noteId}"]`);
              if (noteAgain) {
                noteAgain.style.display = '';
                noteAgain.classList.add('active');
              }
            }, 50);
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
      const noteEl = dom.createNoteElement(note);
      noteEl.classList.add('inserting');
      fragment.appendChild(noteEl);
      setTimeout(() => noteEl.classList.remove('inserting'), ANIMATION.INSERT_DURATION);
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
        showToast('Failed to load notes', 'error');
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

    // Use a for...of loop instead of forEach to allow awaiting
    for (const note of localNotesCache) {
      try {
        const noteEl = await dom.createNoteElement(note); // Wait for the element
        
        // Only add animation class for NEW notes
        if (!currentNoteIds.includes(note.id)) {
          noteEl.classList.add('inserting');
          setTimeout(() => noteEl.classList.remove('inserting'), ANIMATION.INSERT_DURATION);
        }
        
        notesArea.appendChild(noteEl); // Now appending actual element
      } catch (err) {
        console.error("Error creating note element:", err);
      }
    }

    // Restore editor if it was present
    if (editorEl) notesArea.prepend(editorEl);

    // Update scroll indicators
    setTimeout(() => updateScrollIndicators(notesArea), 100);
    dispatchNotesUpdatedEvent();
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

  // Add this to your initialization code (likely in bootstrap function)
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
      dom.getNotesContainer().scrollTo({
        top: 0,
        behavior: 'smooth'
      });

      // Start creating a new note
      editor.startEditing();
    });
  }

  // Add this function to your NotesManager module
  function dispatchNotesUpdatedEvent() {
    window.dispatchEvent(new CustomEvent('notes-updated'));
  }

  // Add this inside the NotesManager IIFE, near the end before the "return" statement:
  // Make the notes cache accessible to the counter component
  window.getNotesData = function() {
    return {
      total: localNotesCache.length,
      completed: localNotesCache.filter(note => note.isCompleted).length
    };
  };

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
      }, { passive: true });

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

  // Enhanced destroy function - add to your code
  function destroy() {
    // Remove document-level listeners
    document.removeEventListener('click', editor.handleOutsideClick, true);
    
    // Remove window listeners
    window.removeEventListener('resize', updateLayoutVariables);
    window.removeEventListener('resize', debounce(updateLayoutVariables));
    window.removeEventListener('resize', debounce(() => {
      const notesArea = dom.getNotesContainer();
      if (notesArea) updateScrollIndicators(notesArea);
    }));
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

    initNewNoteButton();
    await displayNotes();
    await setupEvents();

    // Update layout variables
    updateLayoutVariables();
    window.addEventListener('resize', updateLayoutVariables);

    // Start periodic sync
    syncManager.startPeriodicSync();

    setupThemeToggle();
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
    showInlineNoteEditor: editor.startEditing,
    destroy
  };
})();

window.NotesManager = NotesManager;

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./scripts/service-worker.js', {
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