const NotesManager = (() => {
    const STORAGE = { NOTES: 'notes', INIT: 'notesAppInitialized', VISIT: 'hasVisitedBefore' };
    let deleteModalActive = false;
    let changesModalActive = false;
  
    const getNotes = () => JSON.parse(localStorage.getItem(STORAGE.NOTES) || '[]');
    const setNotes = notes => localStorage.setItem(STORAGE.NOTES, JSON.stringify(notes));
  
    const makeTimestamp = date => ({
      date: date.toLocaleDateString('en-GB'),
      time: date.toLocaleTimeString('en-GB', { hour12: false }),
      timestamp: date.getTime()
    });
  
    function createModal(id, { title, msg, buttons }) {
      let m = document.getElementById(id);
      if (!m) {
        m = document.createElement('div'); m.id = id; m.className = 'modal';
        m.innerHTML = `<div class="modal-content"><h3>${title}</h3><p>${msg}</p><div class="modal-buttons">${buttons.map(b => `<button id="${b.id}" class="${b.cls}">${b.text}</button>`).join('')}</div></div>`;
        document.body.appendChild(m);
        buttons.forEach(b => m.querySelector('#'+b.id).addEventListener('click', b.onClick));
      }
      return m;
    }
    const showModal = id => document.getElementById(id).classList.add('active');
    const hideModal = id => document.getElementById(id).classList.remove('active');
  
    function bootstrap() {
      if (localStorage.getItem(STORAGE.INIT)) return;
      const notes = getNotes();
      if (!localStorage.getItem(STORAGE.VISIT)) {
        localStorage.setItem(STORAGE.VISIT, 'true');
        if (notes.length === 0) {
          const now = new Date();
          const base = makeTimestamp(now);
          setNotes([
            { id: 'example_1', title: 'Welcome to Notes App', description: 'This is your first note!', ...base, isCompleted: false },
            { id: 'example_2', title: 'Click to Expand', description: 'Notes work like spoilers - click me!', ...base, isCompleted: false },
            { id: 'example_3', title: 'Creating New Notes', description: 'Use the + button to add notes.', ...base, isCompleted: false }
          ]);
        }
      }
      localStorage.setItem(STORAGE.INIT, 'true');
    }
  
    function createNote(title, description = '') {
      const now = new Date();
      const note = { id: `note_${now.getTime()}`, title, description, ...makeTimestamp(now), isCompleted: false };
      setNotes([note, ...getNotes()]); displayNotes(); return note;
    }
    function updateNote(id, title, description = '') {
      const notes = getNotes().map(n => n.id === id ? { ...n, title, description, lastEdited: makeTimestamp(new Date()) } : n);
      setNotes(notes); displayNotes(); return notes.find(n => n.id === id);
    }
    function toggleCompletion(id) {
      const notes = getNotes().map(n => {
        if (n.id === id) {
          n.isCompleted = !n.isCompleted;
          if (n.isCompleted) n.completedAt = makeTimestamp(new Date()); else delete n.completedAt;
        }
        return n;
      });
      setNotes(notes); displayNotes();
    }
    function confirmDelete(id) {
      setNotes(getNotes().filter(n => n.id !== id));
      hideModal('delete-modal'); deleteModalActive = false; displayNotes();
    }
    function deleteNote(id) {
      if (deleteModalActive) return;
      deleteModalActive = true;
      createModal('delete-modal', {
        title: 'Delete Note?', msg: 'Are you sure? This cannot be undone.',
        buttons: [
          { id: 'del-cancel', text: 'Cancel', cls: 'secondary-button', onClick: () => { hideModal('delete-modal'); deleteModalActive = false; } },
          { id: 'del-ok', text: 'Delete', cls: 'warning-button', onClick: () => confirmDelete(id) }
        ]
      });
      showModal('delete-modal');
    }
  
    function createNoteElement(n) {
      const el = document.createElement('div'); el.className = `note-entry${n.isCompleted? ' completed-note':''}`; el.dataset.id = n.id;
      el.innerHTML = `<div class="note-title"><div class="title-container"><h2>${n.title}</h2><p>🗓️ ${n.date} @ ${n.time}</p></div>${n.isCompleted?'<canvas class="completion-indicator" width="24" height="24"></canvas>':''}</div><div class="note-details"><p>${n.description||'No description provided.'}</p>${n.isCompleted && n.completedAt?`<div class="completion-info">✅ Completed ${n.completedAt.date} @ ${n.completedAt.time}</div>`:''}<div class="button-row"><button class="${n.isCompleted?'reset-note':'complete-note'}"></button><button class="edit-note"></button><button class="delete-note"></button></div></div>`;
      if (n.isCompleted) { const c = el.querySelector('canvas'); const ctx = c.getContext('2d'); ctx.beginPath(); ctx.arc(12,12,11,0,2*Math.PI); ctx.fillStyle='rgba(76,175,80,0.2)'; ctx.fill(); ctx.beginPath(); ctx.moveTo(6,12); ctx.lineTo(11,17); ctx.lineTo(18,8); ctx.strokeStyle='#4CAF50'; ctx.lineWidth=2; ctx.stroke(); }
      return el;
    }
    function displayNotes() {
      const area = document.getElementById('notes-area'); if (!area) return;
      const editor = area.querySelector('.note-entry-editor'); if (editor) editor.remove();
      area.innerHTML = '';
      const notes = getNotes(); if (!notes.length) { area.textContent='No notes yet.'; return; }
      notes.forEach(n => area.appendChild(createNoteElement(n)));
      if (editor) area.prepend(editor);
    }
  
    function showUnsaved(id, onSave, onDiscard) {
      if (changesModalActive) return;
      changesModalActive = true;
      createModal('unsaved-modal', {
        title: 'Unsaved Changes', msg: 'Save changes before leaving?',
        buttons: [
          { id: 'unsave-cancel', text: 'Cancel', cls: 'secondary-button', onClick: () => { hideModal('unsaved-modal'); changesModalActive = false; onDiscard(); } },
          { id: 'unsave-ok', text: 'Save', cls: 'primary-button', onClick: () => { hideModal('unsaved-modal'); changesModalActive = false; onSave(); } }
        ]
      });
      showModal('unsaved-modal');
    }
  
    function setupEvents() {
      const area = document.getElementById('notes-area'); if (!area) return;
      area.addEventListener('click', e => {
        if (changesModalActive) return;
        const noteEl = e.target.closest('.note-entry'); if (!noteEl) return;
        if (e.target.closest('button')) {
          const id = noteEl.dataset.id;
          const btn = e.target.closest('button');
          if (btn.classList.contains('complete-note') || btn.classList.contains('reset-note')) return toggleCompletion(id);
          if (btn.classList.contains('delete-note')) return deleteNote(id);
          if (btn.classList.contains('edit-note')) return;
        }
        const wasActive = noteEl.classList.contains('active');
        area.querySelectorAll('.note-entry.active').forEach(n => n.classList.remove('active'));
        if (!wasActive) noteEl.classList.add('active');
      });
    }
  
    document.addEventListener('DOMContentLoaded', () => { bootstrap(); displayNotes(); setupEvents(); });
  
    return { createNote, updateNote, toggleCompletion, deleteNote, showUnsaved };
  })();
  window.NotesManager = NotesManager;
  