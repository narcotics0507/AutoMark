# AutoMark

[简体中文](README.md) | **English**

**🚀 Install Now:** [![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?logo=googlechrome&logoColor=white&style=for-the-badge)](https://chromewebstore.google.com/detail/automark/fidibpojnjiakkgfhbpfekibdgdgafce?hl=en&utm_source=ext_sidebar)

AutoMark is a powerful browser extension for Chromium (Chrome, Edge, Brave, etc.) that uses AI models (OpenAI GPT-4, Google Gemini, DeepSeek, etc.) to intelligently analyze, organize, and clean up your browser bookmarks.

## ✨ Core Features

> [!IMPORTANT]
> **Recommendation**: While we strive to ensure safety with multiple safeguards, it is good practice to **export and back up** your bookmarks before performing large-scale organization (Chrome Menu -> Bookmarks -> Bookmark Manager -> Export Bookmarks).

### 1. Smart Add & Rename
When you add a bookmark, the AI automatically analyzes the page title and URL.
*   **Auto-Categorization**: Moves the bookmark to the most appropriate existing folder or creates a new category based on content.
*   **Smart Rename**: If the original title is vague (e.g., "Home - Official Site"), AI suggests a more intuitive and concise name.
*   **Non-intrusive Experience**: A notification appears after adding, with a default delay before execution. You can click "Undo" or modify the target folder/name directly in the popup.

### 2. Batch Organize
Supports full scanning and reorganization of a specific folder (e.g., "Bookmarks Bar").
*   **Visual Preview**: Generates a detailed "Organization Plan" before executing any changes.
*   **Transparent Control**: You can see exactly which folders AI suggests creating and which bookmarks moving. Uncheck any changes you don't like.

### 3. Safe Backup
We prioritize your data safety:
*   **One-Click Backup**: You can export all your bookmarks as a standard HTML file at any time from the dashboard.
*   **Auto-Backup**: By default, the system automatically backs up your bookmarks before executing any organization. You can restore your data easily if needed.

### 4. Bookmark Library Maintenance
We provide a set of tools to keep your bookmark library healthy:
*   **Dead Link Archive**: Scans for inaccessible links. To prevent accidental deletion (e.g., temporary network issues), dead links are moved to a `失效链接归档` (Dead Link Archive) folder instead of being permanently deleted.
*   **Duplicate Cleanup**: Identifies duplicate saved links. Merges duplicates while keeping the earliest or best-located version.

### 5. Configuration & Privacy
*   **Multi-Model Support**: Built-in support for OpenAI, Google Gemini, DeepSeek, and compatible with custom interfaces like One API.
*   **Privacy Protection**: API Keys and configurations are stored locally (LocalStorage) only. Bookmark data is sent to your specified API endpoint only during analysis and is never uploaded to third-party servers.

---

## 🚀 Installation & Usage

1.  **Load Extension**
    *   Open the browser's extension management page (`chrome://extensions/` or `edge://extensions/`).
    *   Enable **"Developer mode"**.
    *   Click **"Load unpacked"** and select the root directory of this project.

2.  **Configuration**
    *   Click the extension icon to enter settings.
    *   Select an API provider and enter your API Key.
    *   Check **"Automatically organize newly added bookmarks"** to enable real-time organization.

3.  **Usage**
    *   **Daily**: Add bookmarks as usual, and keep an eye on the optional notification in the top right.
    *   **Organize**: Click the extension icon -> "Start Smart Organization", and follow the wizard to scan your library.

---

## 🛠️ Troubleshooting
*   **Operation Feedback**: During organization, the console displays real-time actions (e.g., how many links were archived).
*   **Detailed Logs**: If you encounter unknown errors, check the **"System Logs"** area at the bottom left of the settings page. It records detailed API communication and network status for easier debugging.

---

## 📄 Privacy & License

*   **Privacy Policy**: [PRIVACY.md](PRIVACY.md) (Your data privacy is strictly protected)
*   **License**: Copyright (c) 2026 narcotics0507. All Rights Reserved. (No commercial use or distribution allowed)
