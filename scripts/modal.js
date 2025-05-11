// Modal dialog system for managing UI dialogs like confirmations and alerts
export const modal = {
  // Creates or updates a modal dialog with specified content and buttons
  create: (id, { title, msg, buttons }) => {
    let m = document.getElementById(id);

    // Create if doesn't exist, or reset if it does
    if (!m) {
      m = document.createElement('div');
      m.id = id;
      m.className = 'modal';
      document.body.appendChild(m);
    }

    // Build the modal HTML structure
    m.innerHTML = `
      <div class="modal-content">
        <h3>${title}</h3>
        <p>${msg}</p>
        <div class="modal-buttons">
          ${buttons.map(b => {
            let aria = '';
            if (b.ariaLabel) {
              aria = `aria-label="${b.ariaLabel}"`;
            }
            return `<button id="${b.id}" class="${b.cls}" ${aria}>${b.text}</button>`;
          }).join('')}
        </div>
      </div>`;

    // Attach event listeners to each button
    buttons.forEach(b => {
      const btnEl = m.querySelector('#' + b.id);
      if (btnEl) {
        // Replace button to clear old event listeners
        const newBtn = btnEl.cloneNode(true);
        btnEl.parentNode.replaceChild(newBtn, btnEl);
        newBtn.addEventListener('click', b.onClick);
      }
    });

    return m;
  },
  
  // Displays the modal with matching ID
  show: (id) => { 
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('active');
    } else {
      console.error(`Modal with id "${id}" not found`);
    }
  },
  
  // Hides the modal with matching ID
  hide: id => document.getElementById(id).classList.remove('active'),

  // Shows a confirmation dialog for unsaved changes with save/discard options
  showUnsaved: (id, onSave, onDiscard) => {
    // Prevent multiple modals from appearing simultaneously
    if (window.NotesManager && window.NotesManager.modalState && 
        window.NotesManager.modalState.changesActive) {
      return;
    }
    
    // Update application modal state
    if (window.NotesManager && window.NotesManager.modalState) {
      window.NotesManager.modalState.changesActive = true;
    }

    // Create the unsaved changes modal
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
            
            // Reset modal state
            if (window.NotesManager && window.NotesManager.modalState) {
              window.NotesManager.modalState.changesActive = false;
            }
            
            // Execute the discard callback after modal closes
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
            
            // Get editor state from global NotesManager
            const editorState = window.NotesManager && window.NotesManager.editorState;
            
            if (editorState && editorState.cachedTitle) {
              try {
                modal.hide('unsaved-modal');
                
                // Reset modal state
                if (window.NotesManager && window.NotesManager.modalState) {
                  window.NotesManager.modalState.changesActive = false;
                }

                // Execute save callback with cached note content
                if (onSave) {
                  await onSave(id, editorState.cachedTitle, editorState.cachedDescription);
                }
              } catch (error) {
                console.error('Error in modal save operation:', error);
              }
            } else {
              modal.hide('unsaved-modal');
              
              // Reset modal state
              if (window.NotesManager && window.NotesManager.modalState) {
                window.NotesManager.modalState.changesActive = false;
              }
              
              // Execute save callback without parameters
              if (onSave) {
                await onSave();
              }
            }
          }
        }
      ]
    });
    modal.show('unsaved-modal');
  },

  // Shows a confirmation dialog for note deletion
  showDeleteConfirm: (id, onConfirm) => {
    // Prevent multiple delete modals
    if (window.NotesManager && window.NotesManager.modalState && 
        window.NotesManager.modalState.deleteActive) {
      return;
    }
    
    // Update application modal state
    if (window.NotesManager && window.NotesManager.modalState) {
      window.NotesManager.modalState.deleteActive = true;
    }

    // Create the delete confirmation modal
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
            
            // Reset modal state
            if (window.NotesManager && window.NotesManager.modalState) {
              window.NotesManager.modalState.deleteActive = false;
            }
          }
        },
        {
          id: 'del-ok',
          text: 'Delete',
          cls: 'warning-button',
          ariaLabel: 'Confirm deletion',
          onClick: () => {
            modal.hide('delete-modal');
            
            // Execute confirm callback after modal closes
            setTimeout(() => {
              // Reset modal state
              if (window.NotesManager && window.NotesManager.modalState) {
                window.NotesManager.modalState.deleteActive = false;
              }
              
              onConfirm();
            }, 50);
          }
        }
      ]
    });
    modal.show('delete-modal');
  }
};

export default modal;