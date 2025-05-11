// Background synchronization manager for handling client-server data operations
import { api } from './api.js';
import { time } from './time.js';

// Manages data synchronization between local storage and server
export const syncManager = {
  // Track last full sync time
  lastFullSyncTime: Date.now(),
  pendingSyncTimeout: null,
  
  // Adds an operation to the pending queue for later processing
  addOperation: function(type, id, data) {
    // Get reference to pendingOperations
    if (!window.NotesManager) {
      console.error('NotesManager not available');
      return;
    }
    
    window.NotesManager.pendingOperations.push({ 
      type, 
      id, 
      data, 
      timestamp: Date.now() 
    });

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

  // Performs a full synchronization with the server (push local changes and pull server changes)
  fullSync: async function() {
    console.log("Running full sync...");
    
    if (!window.NotesManager) {
      console.error('NotesManager not available');
      return;
    }
    
    // Reference to needed state
    const pendingOperations = window.NotesManager.pendingOperations;

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
        window.NotesManager.localNotesCache = serverNotes;
        window.NotesManager.localNotesCache.forEach(note => time.normalizeNote(note));

        // Update the UI
        await window.NotesManager.displayNotes(false);
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

  // Checks if server data differs from local cache to avoid unnecessary updates
  hasChangesFromServer: function(serverNotes) {
    if (!window.NotesManager) {
      console.error('NotesManager not available');
      return false;
    }
    
    const localNotesCache = window.NotesManager.localNotesCache;
    
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

  // Processes pending operations queue one by one to sync with server
  processQueue: async function() {
    if (!window.NotesManager) {
      console.error('NotesManager not available');
      return;
    }
    
    if (window.NotesManager.syncInProgress || 
        window.NotesManager.pendingOperations.length === 0) return;

    window.NotesManager.syncInProgress = true;

    try {
      // Get the oldest operation
      const operation = window.NotesManager.pendingOperations.shift();

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
      if (window.NotesManager.pendingOperations.length > 0) {
        window.NotesManager.pendingOperations.unshift(operation);
      }
    } finally {
      window.NotesManager.syncInProgress = false;

      // If more operations remain, continue processing
      if (window.NotesManager.pendingOperations.length > 0) {
        setTimeout(() => this.processQueue(), 100);
      }

      // Update status indicator
      this.updateSyncStatus();
    }
  },

  // Starts periodic background sync on a 30-second interval
  startPeriodicSync: function() {
    if (!window.NotesManager) {
      console.error('NotesManager not available');
      return;
    }
    
    // Clear any existing sync timer
    if (window.NotesManager.syncTimer) {
      clearInterval(window.NotesManager.syncTimer);
      window.NotesManager.syncTimer = null;
    }

    // Create new timer for 30 second intervals
    window.NotesManager.syncTimer = setInterval(() => this.fullSync(), 30000);
    console.log("Started periodic 30-second sync");
  },

  // Checks if there are pending operations needing to be synced
  hasPendingOperations: function() {
    if (!window.NotesManager) return false;
    return window.NotesManager.pendingOperations.length > 0 || window.NotesManager.syncInProgress;
  },

  // Updates the sync status indicator in the UI based on current sync state
  updateSyncStatus: function() {
    const statusEl = document.querySelector('.sync-status');
    if (!statusEl) return;

    if (this.hasPendingOperations()) {
      if (!window.NotesManager) return;
      statusEl.textContent = `Syncing ${window.NotesManager.pendingOperations.length} changes...`;
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

  // Performs an immediate emergency sync when unexpected situations occur
  emergencySync: async function() {
    console.log("Emergency sync triggered!");
    await this.fullSync();
  }
};

export default syncManager;