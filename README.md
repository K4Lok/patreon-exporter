# Patreon Exporter

Export Patreon posts to clean PDFs for offline reading with a single click.

## Features

- **One-click export**: Convert any Patreon post to PDF instantly
- **Continuous PDF pages**: Creates single long pages without splitting images across page breaks
- **Clean formatting**: Removes all navigation, comments, and CTAs - just the content
- **Customizable settings**: Choose between A4/Letter page widths and image quality levels
- **Privacy-focused**: All processing happens locally in your browser - no servers, no tracking
- **Cross-browser support**: Works on Chrome, Edge, Firefox, and other Chromium-based browsers

## Installation

### From Source (Development)

1. Clone this repository:
```bash
git clone https://github.com/yourusername/patreon-exporter.git
cd patreon-exporter
```

2. Install dependencies:
```bash
pnpm install
# or npm install
```

3. Start development mode:
```bash
pnpm dev
# or npm run dev
```

4. The extension will automatically open in your browser with hot-reload enabled

### Building for Production

```bash
# Build for all browsers
pnpm build

# Build for specific browser
pnpm build:firefox

# Create distributable ZIP files
pnpm zip
```

## Usage

1. Navigate to any Patreon post you want to export
2. Click the Patreon Exporter icon in your browser toolbar
3. Configure your export settings (optional):
   - **Page Width**: A4 or Letter
   - **Image Quality**: High, Medium, or Low
4. Click "Export as Continuous PDF"
5. Choose where to save your PDF

## Settings

- **Page Width**: Choose between A4 or Letter width (height adjusts automatically to content)
- **Image Quality**: 
  - High: Best quality, larger file size
  - Medium: Balanced quality and file size
  - Low: Smaller files, reduced image quality

Settings are automatically saved and remembered for future exports.

**Note**: The new continuous PDF format ensures that images and content are never split across page breaks, creating a seamless reading experience.

## Technical Stack

- **Framework**: [WXT](https://wxt.dev/) - Next-gen Web Extension Framework
- **UI**: React 19 with TypeScript
- **PDF Generation**: jsPDF with html2canvas
- **Browser APIs**: Manifest V3 compliant

## Privacy

- All processing happens locally in your browser
- No data is sent to external servers
- No analytics or tracking
- Minimal permissions required (activeTab, downloads, storage)

## Development

### Project Structure

```
patreon-exporter/
├── entrypoints/
│   ├── background.ts    # Background service worker
│   ├── content.ts       # Content script for Patreon pages
│   └── popup/          # React popup UI
├── public/             # Static assets
├── wxt.config.ts       # WXT configuration
└── package.json        # Dependencies
```

### Key Commands

```bash
pnpm dev          # Start development mode
pnpm build        # Build for production
pnpm zip          # Create distribution packages
pnpm compile      # TypeScript type checking
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Legal Notice

This extension is for personal archival use only. Please respect content creators' rights and Patreon's terms of service. Do not use this tool to redistribute copyrighted content.

## License

MIT License - see LICENSE file for details
