// Time utility functions for note timestamps and ID generation
export const time = {
  // Creates a standardized timestamp object from a date
  makeTimestamp: date => ({
    date: date.toLocaleDateString('en-GB'),
    time: date.toLocaleTimeString('en-GB', { hour12: false }),
    timestamp: date.getTime()
  }),

  // Returns the current date
  now: () => new Date(),

  // Ensures a note has proper timestamp properties
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

  // Generates a unique ID based on current timestamp
  generateId: () => `note_${Date.now()}`
};

export default time;