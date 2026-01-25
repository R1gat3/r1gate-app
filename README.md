# R1Gate Desktop App

Desktop application for [R1Gate](https://r1gate.ru) — a voice communication platform.

![R1Gate Logo](icon.svg)

## Features

- Native desktop experience for Windows, macOS, and Linux
- System tray integration
- Screen sharing support
- Push-to-talk and voice activity detection
- Custom frameless window with native controls
- Single instance lock (prevents duplicate processes)
- Splash screen while loading

## Download

Download the latest release from the [Releases](https://github.com/R1gat3/r1gate-app/releases) page.

### Available builds:
- **Windows:** `.exe` installer
- **Linux:** `.AppImage`, `.deb`
- **macOS:** `.dmg`

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/R1gat3/r1gate-app.git
cd r1gate-app

# Install dependencies
npm install

# Run in development mode
npm start
```

### Build

```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux

# Build for macOS
npm run build:mac
```

## Project Structure

```
r1gate-app/
├── main.js          # Main Electron process
├── preload.js       # Preload script (IPC bridge)
├── splash.html      # Loading screen
├── icon.png         # App icon
├── icon.svg         # Vector icon
├── package.json     # Dependencies and build config
└── LICENSE          # MIT License
```

## Tech Stack

- [Electron](https://www.electronjs.org/) — Cross-platform desktop apps
- [electron-builder](https://www.electron.build/) — Build and publish

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Links

- [R1Gate Web](https://web.r1gate.ru)
- [R1Gate Website](https://r1gate.ru)
- [Report Issues](https://github.com/R1gat3/r1gate-app/issues)
