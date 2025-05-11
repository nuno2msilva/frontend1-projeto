# Port-a-Notes - A Modern Notes App

Port-a-Notes is a feature-rich, responsive notes application that allows users to create, organize, and manage their thoughts and tasks efficiently.

## Features

- **Create, Read, Update, Delete Notes**: Full CRUD operations for managing notes
- **Real-time Synchronization**: Changes sync across devices
- **Markdown Support**: Format your notes with simple markdown syntax
- **PWA Support**: Install as a Progressive Web App for offline access
- **Responsive Design**: Works on mobile, tablet, and desktop devices
- **Dark/Light Theme**: Toggle between light and dark modes
- **Local Storage**: Notes persist even when offline
- **Note Counter**: Displays the total number of notes
- **Canvas Integration**: Visual elements using Canvas API
- **Web Components**: Custom components for enhanced functionality

## Tech Stack

- **HTML5**: Structure and semantics
- **CSS3**: Styling with responsive design principles
- **JavaScript (ES6+)**: Core functionality
  - **Web Components API**: For custom elements like note-counter
  - **Canvas API**: For visual elements
  - **Local Storage API**: For offline data persistence
  - **Service Worker API**: For PWA functionality

## Project Structure

```
/
├── index.html          # Main HTML entry point
├── manifest.json       # PWA manifest
├── service-worker.js   # Service worker for offline functionality
├── scripts/           
│   ├── script.js       # Main JavaScript file
│   ├── api.js          # API interactions
│   ├── animation.js    # UI animations
│   ├── canvas.js       # Canvas-based graphics
│   ├── dom.js          # DOM manipulation utilities
│   ├── markdown.js     # Markdown parser
│   ├── modal.js        # Modal dialog functionality
│   ├── noteCounter.js  # Web component for counting notes
│   ├── service-worker.js # PWA service worker
│   ├── sync.js         # Data synchronization
│   ├── theme.js        # Theme switching functionality
│   └── time.js         # Time-related utilities
└── styles/
    └── style.css       # Main stylesheet
```


## Usage

- **Create a new note**: Click the "+" button
- **Edit a note**: Click on a note to open it in the editor
- **Delete a note**: Use the delete button in the note editor
- **Toggle theme**: Use the theme toggle in the header
- **Format text**: Use markdown syntax in the note description

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
