/**
 * Draws checkmarks on canvas elements
 */

function drawCheckmark(canvas) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    
    // Clear canvas
    ctx.clearRect(0, 0, size, size);
    
    // Draw checkmark
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(size * 0.2, size * 0.5);
    ctx.lineTo(size * 0.4, size * 0.7);
    ctx.lineTo(size * 0.8, size * 0.3);
    ctx.stroke();
}

// Initialize existing checkmarks when page loads
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.completion-mark').forEach(canvas => {
        canvas.width = 40;
        canvas.height = 40;
        drawCheckmark(canvas);
    });
});

// Make function available globally
window.drawCheckmark = drawCheckmark;