# Python Project Statistics

Python Project Statistics gives you a quick view of the Python and Markdown files in your VS Code workspace.

## Features

- Shows the total number of `.py` files.
- Shows the number of lines in every Python file.
- Shows the total number of `.md` files and their paths.
- Opens the report in a separate `Project Statistics` editor tab.
- Provides a Refresh button to rescan the workspace.
- Excludes dependency, version-control, virtual-environment, and Python cache directories.

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

### 0.0.1

Initial release with Python and Markdown project statistics.
