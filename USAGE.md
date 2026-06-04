# Usage

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- A Chromium-based browser (Chrome, Edge, Brave, Opera, etc.)

## Build the extension

```bash
git clone https://github.com/shafiqimtiaz/clean-bookmarks.git
cd clean-bookmarks
npm install
npm run build
```

The built extension will be in the `dist/` folder.

## Load in your browser

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder inside the cloned repository

The extension icon will appear in your toolbar.

## Configure

1. Click the toolbar icon, then **Settings**
2. Pick a provider (or select **Custom** for any OpenAI-compatible endpoint)
3. Enter the API base URL, your API key, and model name
4. Save

When the extension makes its first API call, Chrome will ask you to grant host permission to that provider's origin.

## Run

Click the toolbar icon, then **Organize bookmarks** to start.
