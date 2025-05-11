// Markdown processing utilities for the Notes application

// Dynamically loads the Marked.js library if not already available
export function loadMarkedJS() {
  return new Promise((resolve, reject) => {
    // Skip loading if already available in the global scope
    if (window.marked) {
      resolve(window.marked);
      return;
    }
    
    // Create script element to load from CDN
    console.log('Loading Marked.js dynamically');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    script.async = true;
    
    // Handle successful script loading
    script.onload = () => {
      console.log('Marked.js loaded successfully');
      resolve(window.marked);
    };
    
    // Handle loading errors
    script.onerror = () => {
      const error = new Error('Failed to load Marked.js');
      console.error(error);
      reject(error);
    };
    
    // Add the script to the document
    document.head.appendChild(script);
  });
}

// Converts markdown text to HTML using the Marked.js library
export async function parseMarkdown(text) {
  // Return default text if no content provided
  if (!text) return 'No description provided.';
  
  try {
    // Ensure the markdown library is loaded before using it
    await loadMarkedJS();
    
    // Use the library to convert markdown to HTML
    return marked.parse(text);
  } catch (error) {
    // Log errors and fall back to plain text if parsing fails
    console.error('Error parsing markdown:', error);
    return text;
  }
}

export default { loadMarkedJS, parseMarkdown };