# AI-Studio-File-Stats

AI-Studio-File-Stats (**aicount**) shows how many readable files are in your VS Code workspace and how many lines each file has.

After you install it, a popup asks whether you want to see the project structure. The totals stay in the **aicount** view on the left Activity Bar. The full file list opens in a **Project Statistics** tab.

## Features

- Shows a one-time install popup: **aicount is installed. Do you want to see the project structure?** Choose **Open** or **Close**.
- Adds an **aicount** icon on the left Activity Bar. That sidebar shows total files, total lines, and **Open full report**.
- Opens the full report in a **Project Statistics** editor tab with serial number, file name, and line count.
- Lets you search files, sort by name or line count, and refresh the scan.
- Exports a CSV with total files, total lines, each file name, and its line count. Each download uses a unique name: `{project}_AIStudioFileStats_{YYYYMMDD}_{HHMMSS}.csv`.
- Counts every physical line, including blank lines and a trailing blank line at the end of a file.
- Skips dependency, version-control, virtual-environment, and cache folders such as `node_modules`, `.git`, and `.venv`.
- Does not read or display sensitive files such as environment, Docker, Git, or lock files.

## Usage

1. Install **aicount** from the Extensions view.
2. When the install popup appears, choose **Open** to view the report now, or **Close** to skip it.
3. Open a project folder in VS Code.
4. Click the **aicount** icon in the left Activity Bar to see totals in the sidebar.
5. Click **Open full report** for the file table, or run **Project Statistics** from the Command Palette.
6. Use **Refresh** after project files change. Use **Export** to download the CSV.

The extension warns you if no workspace folder is open. The install popup is shown once per install. Uninstalling and installing again shows it again.

## Requirements

- Visual Studio Code 1.134.0 or later.
- An open workspace folder containing the files you want to inspect.

## Extension Settings

This extension does not add any settings.

## Known Issues

Line counts are based on physical lines in each file. Files that cannot be read, binary files, and files with no extension are not included in the report.

## Release Notes

### 0.0.2

Added all-file statistics, extension grouping, and an extension icon.

### 0.0.4

Added privacy exclusions for environment, Docker, Git, and lock files.

### 0.0.9

Install popup opens the aicount sidebar and Project Statistics report. The report lists file names and line counts without grouping by type. CSV export includes totals and a unique timestamped file name.
