// Canvas drawing utilities for the Notes application
export const canvas = {
  // Draws a green checkmark indicator on a canvas element
  drawCompletionIndicator: function(canvas) {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw green circle background
    ctx.beginPath();
    ctx.arc(12, 12, 11, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(76,175,80,0.2)';
    ctx.fill();
    
    // Draw checkmark shape
    ctx.beginPath();
    ctx.moveTo(6, 12);
    ctx.lineTo(11, 17);
    ctx.lineTo(18, 8);
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.stroke();
  },
  
  // Creates and returns a new canvas with a completion indicator drawn on it
  createCompletionIndicator: function(size = 24) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.className = 'completion-indicator';
    
    // Draw the checkmark on the newly created canvas
    this.drawCompletionIndicator(canvas);
    return canvas;
  }
};

export default canvas;