# AutoMark

[简体中文](README.md) | **English**

A powerful browser extension for Chromium (Chrome, Edge, Brave, etc.) that uses AI models (OpenAI GPT-4, Google Gemini, DeepSeek, etc.) to intelligently analyze, categorize, and clean up your browser bookmarks.

## ✨ Core Features

> [!IMPORTANT]
> **Recommendation**: While we strive to ensure safety, it is good practice to **export and back up** your bookmarks before performing large-scale organization (Chrome Menu -> Bookmarks -> Bookmark Manager -> Export Bookmarks).

### 1. Smart Add
When you add a bookmark, AI automatically analyzes the title and URL to categorize it into the most appropriate folder.
*   **Intelligent Recommendation**: Automatically moves to an existing folder or creates a new category.
*   **Non-intrusive**: Defaults to a 4-second delay, giving you time for manual operations; if you move the bookmark manually during this time, AI automatically cancels.
*   **Full Control**: Provides a popup feedback in the top right corner, supporting one-click undo or modification.

### 2. Batch Organize
Supports full scanning and re-categorization of the "Bookmarks Bar" or "Other Bookmarks".
*   **Visual Preview**: Generates a complete move/rename plan before execution, supporting item-by-item confirmation.
*   **Safe & Reliable**: You know exactly every change, avoiding accidental operations.

### 3. Maintenance Tools
*   **Dead Link Detection**: Quickly scans for inaccessible dead links for one-click cleanup.
*   **Duplicate Cleanup**: Identifies and merges duplicate saved links to keep your bookmark library clean.

### 4. Configuration & Privacy
*   **Multi-Model Support**: Built-in support for OpenAI, Google Gemini, DeepSeek, and compatible with custom interfaces like One API.
*   **Privacy Protection**: API Keys and configurations are stored locally (LocalStorage) only. Bookmark data is sent to your specified API endpoint only during analysis and is never uploaded to third-party servers.

---

## 🚀 Installation & Usage

1.  **Load Extension**
    *   Open the browser's extension management page (`chrome://extensions/` or `edge://extensions/`).
    *   Enable **Developer mode**.
    *   Click **Load unpacked** and select the root directory of this project.

2.  **Configuration**
    *   Click the extension icon to enter settings.
    *   Select an API provider and enter your API Key.
    *   Check **"Automatically organize newly added bookmarks"** to enable the Smart Add feature.

3.  **Usage**
    *   **Daily**: Add bookmarks as usual, and AI will automatically process them in the background.
    *   **Organize**: Click the extension icon -> "Start Smart Organization", and follow the wizard.

---

## 🛠️ Troubleshooting
If you encounter problems, please check the **"System Logs"** at the bottom of the settings page, which displays detailed API error info or network status.

---

**License**: MIT
