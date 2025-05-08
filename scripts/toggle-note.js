// File: scripts/toggle-note.js
import { NotesManager } from './notes-manager.js';
import { NoteAnimations } from './note-animations.js';

export const ToggleNote = {
    async init() {
        // Use event delegation on the notes area
        const notesArea = document.getElementById('notes-area');
        notesArea.addEventListener('click', async (e) => {
            if (e.target.classList.contains('complete-note') || e.target.classList.contains('reset-note')) {
                const noteEntry = e.target.closest('.note-entry');
                if (noteEntry) {
                    await this.toggleNoteCompletion(noteEntry);
                }
            }
        });
    },

    async toggleNoteCompletion(noteEl) {
        const noteId = noteEl.dataset.id;
        const notes = await NotesManager.loadNotesFromStorage();
        const noteIndex = notes.findIndex(n => n.id === noteId);
        
        if (noteIndex === -1) return;

        // Toggle completion status
        notes[noteIndex].isCompleted = !notes[noteIndex].isCompleted;
        
        // Save changes
        await NotesManager.saveNotesToStorage(notes);
        
        // Update UI
        noteEl.classList.toggle('completed-note');
        
        // Update button class
        const toggleBtn = noteEl.querySelector('.complete-note, .reset-note');
        toggleBtn.className = notes[noteIndex].isCompleted ? 'reset-note' : 'complete-note';
        
        // Update completion mark
        const titleEl = noteEl.querySelector('.note-header h2');
        if (notes[noteIndex].isCompleted) {
            if (!titleEl.querySelector('.completion-mark')) {
                const canvas = document.createElement('canvas');
                canvas.className = 'completion-mark';
                canvas.width = 40;
                canvas.height = 40;
                titleEl.appendChild(canvas);
                if (typeof drawCheckmark === 'function') {
                    drawCheckmark(canvas);
                }
            }
        } else {
            const checkmark = titleEl.querySelector('.completion-mark');
            if (checkmark) checkmark.remove();
        }

        // Add transition class for animation
        noteEl.classList.add('status-changing');
        setTimeout(() => {
            noteEl.classList.remove('status-changing');
        }, 300);

        // Refresh notes to update order
        await window.refreshNotes();
    },

    async refreshNotes() {
        const notes = await NotesManager.loadNotesFromStorage();
        const sortedNotes = await NotesManager.sortNotes(notes);
        
        const notesArea = document.getElementById('notes-area');
        notesArea.innerHTML = '';
        
        sortedNotes.forEach(note => {
            const noteEl = this.createNoteElement(note);
            notesArea.appendChild(noteEl);
        });
    },

    createNoteElement(note) {
        const noteEl = document.createElement('div');
        noteEl.className = note.isCompleted ? 'note-entry completed-note' : 'note-entry';
        noteEl.dataset.id = note.id;
        
        const displayDate = note.editDate && note.editTime 
            ? `🗓️ ${note.date} @ ${note.time} (🕓 ${note.editDate} @ ${note.editTime})`
            : `🗓️ ${note.date} @ ${note.time}`;
        
        noteEl.innerHTML = `
            <div class="note-header">
                <h2>${note.title}</h2>
                <p>${displayDate}</p>
                ${note.isCompleted ? '<canvas class="completion-mark" width="40" height="40"></canvas>' : ''}
            </div>
            <div class="note-details">
                <p>${note.description || "No description provided."}</p>
                <div class="note-actions">
                    <button class="${note.isCompleted ? 'reset-note' : 'complete-note'}"></button>
                    <button class="edit-note"></button>
                    <button class="delete-note"></button>
                </div>
            </div>
        `;
        
        return noteEl;
    }
};