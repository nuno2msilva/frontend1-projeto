// API service for note operations - communicates with the backend server
const API_URL = 'https://67f5684b913986b16fa476f9.mockapi.io/api/onion/NoteTaking';

export const api = {
  // Fetches all notes from the server
  getNotes: async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error('Failed to fetch notes');
      return await response.json();
    } catch (error) {
      console.error('Error fetching notes:', error);
      return []; // Return empty array on error for graceful degradation
    }
  },

  // Creates a new note on the server
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
      return null; // Return null to indicate creation failure
    }
  },

  // Updates an existing note by ID
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
      return null; // Return null to indicate update failure
    }
  },

  // Deletes a note by ID
  deleteNote: async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete note');
      return true; // Return true to indicate successful deletion
    } catch (error) {
      console.error('Error deleting note:', error);
      return false; // Return false to indicate deletion failure
    }
  }
};

export default api;