# Changelog

All notable changes to **AI-Studio-File-Stats** are documented in this file.

## 0.0.1

Initial release.

- Sidebar on the Activity Bar shows total files and total lines
- One-time install popup to open the project structure
- Project Statistics report with serial number, file name, and line count
- Search, sort by name or line count, and Refresh
- CSV export named `{project}_AIStudioFileStats_{YYYYMMDD}_{HHMMSS}.csv`
- Counts every physical line, including blank lines
- Skips generated folders, binaries, known secret files, and contents that look like secrets
