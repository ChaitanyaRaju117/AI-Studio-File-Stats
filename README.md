# AI-Studio-File-Stats

AI-Studio-File-Stats shows how many readable files are in your VS Code workspace and how many lines each file has.

After you install it, a popup asks whether you want to see the project structure. The totals stay in the **AI-Studio-File-Stats** view on the left Activity Bar. The full file list opens in a **Project Statistics** tab.

## Features

- Shows a one-time install popup: **AI-Studio-File-Stats is installed. Do you want to see the project structure?** Choose **Open** or **Close**.
- Adds an **AI-Studio-File-Stats** icon on the left Activity Bar. That sidebar shows total files, total lines, and **Open full report**.
- Opens the full report in a **Project Statistics** editor tab with serial number, file name, and line count.
- Lets you search files, sort by name or line count, and refresh the scan.
- Exports a CSV with total files, total lines, each file name, and its line count. Each download uses a unique name: `{project}_AIStudioFileStats_{YYYYMMDD}_{HHMMSS}.csv`.
- Counts every physical line, including blank lines and a trailing blank line at the end of a file.
- Skips dependency, version-control, virtual-environment, and cache folders such as `node_modules`, `.git`, and `.venv`.
- Skips known secret files by name (`.env`, `appsettings.json`, `settings.py`, keys/certs, and similar) without reading them. Ordinary Dockerfiles, Compose files, `nginx.conf`, and `.properties` files are counted unless their contents look like secrets.

## Usage

1. Open a project folder in VS Code.
2. Install **AI-Studio-File-Stats** from the Extensions view.
3. When the install popup appears, choose **Open** to view the report now, or **Close** to skip it.
4. Click the **AI-Studio-File-Stats** icon in the left Activity Bar to see totals in the sidebar.
5. Click **Open full report** for the file table, or run **Project Statistics** from the Command Palette.
6. Use **Refresh** after project files change. Use **Export** to download the CSV.

The extension warns you if no workspace folder is open. The install popup is shown once per install. Uninstalling and installing again shows it again.

## Requirements

- Visual Studio Code 1.134.0 or later.
- An open workspace folder containing the files you want to inspect.

## Extension Settings

This extension does not add any settings.

## Known Issues

Line counts are based on physical lines in each file. Files that cannot be read, binary files, and files whose contents look like secrets are not included in the report.

## Release Notes

### 0.0.1

Initial release.

- Sidebar on the Activity Bar shows total files and total lines
- One-time install popup to open the project structure
- Project Statistics report with serial number, file name, and line count
- Search, sort by name or line count, and Refresh
- CSV export named `{project}_AIStudioFileStats_{YYYYMMDD}_{HHMMSS}.csv`
- Counts every physical line, including blank lines
- Skips generated folders, binaries, known secret files, and contents that look like secrets

## License

This extension is licensed under the MIT License. See [License.txt](License.txt).

## Privacy

This extension does not collect, store, or send your source code or personal data. See [privacy.md](privacy.md).
