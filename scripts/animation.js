// Animation utilities for note movements and transitions

// Animation constants for consistent timing throughout the app
export const ANIMATION = {
  DURATION: 1500,    // 1.5 seconds for standard animations
  EASING: 'cubic-bezier(0.2, 0.8, 0.2, 1)', // Standard easing function
  CLEANUP_DELAY: 1600,  // Duration + 100ms buffer for reliable cleanup
  INSERT_DURATION: 500, // Duration for note insertion animations
  DELETE_DURATION: 300  // Duration for note deletion animations
};

// Animates note position when completing/uncompleting a note
export function animateNotePosition(note, notesArea, isCompleting) {
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

  // Don't animate if scroll distance is too small (less than 10px)
  if (Math.abs(totalScrollNeeded) < 10) return;

  // Match exactly with CSS transition speed (1s)
  const startTime = performance.now();
  const duration = 1000; // Match with the note animation (1s)

  // Cancel any existing animations to prevent conflicts
  if (window.scrollAnimation) cancelAnimationFrame(window.scrollAnimation);

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

// Smoothly scrolls an element into view within a container
export function scrollElementIntoView(element, container, additionalOffset = 0, centerElement = false) {
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

    // Don't scroll if element is already within 10px of center
    if (Math.abs(elementCenter - containerCenter) < 10) return;
  } else {
    // Just make sure element is visible
    if (elementRect.top < containerRect.top) {
      // Element is above viewport - scroll up
      targetScroll = container.scrollTop - (containerRect.top - elementRect.top) - additionalOffset;
    } else if (elementRect.bottom > containerRect.bottom) {
      // Element is below viewport - scroll down
      targetScroll = container.scrollTop + (elementRect.bottom - containerRect.bottom) + additionalOffset;
    } else {
      // Already visible - no scrolling needed
      return;
    }
  }

  // Perform the scroll with smooth animation
  container.scrollTo({
    top: targetScroll,
    behavior: 'smooth'
  });
}

// Calculates cubic bezier easing value for custom animation curves
export function cubicBezier(p0, p1, p2, p3, t) {
  const term1 = 3 * p1 * t * (1 - t) * (1 - t);
  const term2 = 3 * p2 * t * t * (1 - t);
  const term3 = p3 * t * t * t;
  return term1 + term2 + term3;
}

// Animates note movement with transform transitions
export function animateNoteMovement(note, oldPosition, options = {}) {
  // Default options
  const defaults = {
    duration: 1500,  // Match the 1.5s animation time from toggleCompletion
    easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    rotation: -0.5,  // Slight rotation for visual interest
    addRotation: true
  };

  const settings = {...defaults, ...options};
  const newPosition = note.getBoundingClientRect();

  // Calculate movement - if too small, use minimum movement for visibility
  let deltaY;
  if (Math.abs(oldPosition.top - newPosition.top) > 5) {
    deltaY = oldPosition.top - newPosition.top;
  } else {
    deltaY = 40; // Minimum movement for visibility
  }

  // Add relevant classes and set will-change for performance
  note.classList.add('moving');
  note.style.willChange = 'transform';

  // Start at old position
  note.style.transform = `translateY(${deltaY}px)`;
  note.style.transition = 'none';

  // Force reflow to ensure transform is applied before animation starts
  note.offsetHeight;

  // Animate to new position
  requestAnimationFrame(() => {
    note.style.transition = `transform ${settings.duration/1000}s ${settings.easing}`;
    note.style.transform = '';

    // Add rotation if specified for more natural movement
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

  // Clean up after animation completes
  setTimeout(() => {
    note.style.willChange = 'auto';
    note.classList.remove('moving', 'saved');
  }, ANIMATION.CLEANUP_DELAY);

  return deltaY;
}

// Captures current positions of notes before DOM changes for animation reference
export function captureNotePositions(selector = '.note-entry:not(.note-entry-editor)', collectSize = false) {
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

export default {
  ANIMATION,
  animateNotePosition,
  scrollElementIntoView,
  cubicBezier,
  animateNoteMovement,
  captureNotePositions
};