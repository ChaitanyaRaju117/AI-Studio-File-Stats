# AI-Studio-File-Stats

AI-Studio-File-Stats gives you a structured view of all readable files in your VS Code workspace.

## Features

- Shows total files and total lines.
- Groups files by extension, including Java, C, C++, Python, Markdown, and other file types.
- Shows the file name and number of lines in each file.
- Opens the report in a separate `Project Statistics` editor tab.
- Provides a Refresh button to rescan the workspace.
- Excludes dependency, version-control, virtual-environment, and Python cache directories.
- Does not read or display sensitive environment, Docker, Git, or lock files.

## Usage

1. Open a project folder in VS Code.
2. Open the Command Palette with `Ctrl+Shift+P`.
3. Run **Project Statistics**.
4. Select **Refresh** after changing project files.

The extension displays a warning if no workspace folder is open.

## Requirements

- Visual Studio Code 1.134.0 or later.
- An open workspace folder containing the files you want to inspect.

## Extension Settings

This extension does not add any settings.

## Known Issues

Line counts are based on physical lines in each file. Files that cannot be read are not included in the report.

## Release Notes

### 0.0.2

Added all-file statistics, extension grouping, and an extension icon.

### 0.0.4

Added privacy exclusions for environment, Docker, Git, and lock files.
