// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

export function countLines(content: string): number {
	if (content.length === 0) {
		return 0;
	}

	const lines = content.split(/\r\n|\r|\n/);
	return content.endsWith('\n') || content.endsWith('\r') ? lines.length - 1 : lines.length;
}

interface PythonFileStats {
	path: string;
	lines: number;
}

interface ProjectStats {
	pythonFiles: PythonFileStats[];
	markdownFiles: string[];
}

let statisticsPanel: vscode.WebviewPanel | undefined;

async function collectProjectStats(): Promise<ProjectStats> {
	const exclude = '**/{node_modules,.git,.venv,venv,__pycache__}/**';
	const pythonUris = await vscode.workspace.findFiles('**/*.py', exclude);
	const markdownUris = await vscode.workspace.findFiles('**/*.md', exclude);

	const pythonFiles = await Promise.all(pythonUris.map(async (uri) => {
		const content = await vscode.workspace.fs.readFile(uri);
		return {
			path: vscode.workspace.asRelativePath(uri),
			lines: countLines(new TextDecoder().decode(content)),
		};
	}));

	return {
		pythonFiles: pythonFiles.sort((first, second) => first.path.localeCompare(second.path)),
		markdownFiles: markdownUris
			.map((uri) => vscode.workspace.asRelativePath(uri))
			.sort((first, second) => first.localeCompare(second)),
	};
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>'"]/g, (character) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		"'": '&#39;',
		'"': '&quot;',
	}[character] ?? character));
}

async function renderStatistics(panel: vscode.WebviewPanel): Promise<void> {
	const stats = await collectProjectStats();
	const pythonRows = stats.pythonFiles.length === 0
		? '<li class="empty">No Python files found.</li>'
		: stats.pythonFiles.map((file) => `<li><span>${escapeHtml(file.path)}</span><strong>${file.lines}</strong></li>`).join('');
	const markdownRows = stats.markdownFiles.length === 0
		? '<li class="empty">No Markdown files found.</li>'
		: stats.markdownFiles.map((file) => `<li>${escapeHtml(file)}</li>`).join('');

	panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 20px; }
h1 { font-size: 24px; margin: 0 0 20px; }
h2 { font-size: 14px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: .08em; }
.summary { display: flex; gap: 12px; flex-wrap: wrap; }
.metric { border: 1px solid var(--vscode-panel-border); padding: 14px; min-width: 130px; }
.metric strong { display: block; font-size: 28px; color: var(--vscode-textLink-foreground); }
ul { list-style: none; padding: 0; margin: 0; }
li { border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 16px; justify-content: space-between; padding: 8px 0; }
li strong { color: var(--vscode-textPreformat-foreground); }
.empty { opacity: .7; }
button { background: var(--vscode-button-background); border: 0; color: var(--vscode-button-foreground); cursor: pointer; padding: 7px 12px; }
button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
<button id="refresh">Refresh</button>
<h1>Project Statistics</h1>
<div class="summary">
<div class="metric"><strong>${stats.pythonFiles.length}</strong>Python files</div>
<div class="metric"><strong>${stats.markdownFiles.length}</strong>Markdown files</div>
</div>
<h2>Python files and lines</h2>
<ul>${pythonRows}</ul>
<h2>Markdown files</h2>
<ul>${markdownRows}</ul>
<script>
const vscode = acquireVsCodeApi();
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
</script>
</body>
</html>`;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "poc" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('poc.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from poc!');
	});
	const statisticsCommand = vscode.commands.registerCommand('poc.projectStatistics', async () => {
		if (!vscode.workspace.workspaceFolders?.length) {
			vscode.window.showWarningMessage('Open a project folder to view project statistics.');
			return;
		}

		if (statisticsPanel) {
			statisticsPanel.reveal(vscode.ViewColumn.Active);
			await renderStatistics(statisticsPanel);
			return;
		}

		statisticsPanel = vscode.window.createWebviewPanel(
			'poc.projectStatistics',
			'Project Statistics',
			vscode.ViewColumn.Active,
			{ enableScripts: true },
		);
		statisticsPanel.onDidDispose(() => statisticsPanel = undefined, null, context.subscriptions);
		statisticsPanel.webview.onDidReceiveMessage(async (message: { type: string }) => {
			if (message.type === 'refresh' && statisticsPanel) {
				await renderStatistics(statisticsPanel);
			}
		}, null, context.subscriptions);
		await renderStatistics(statisticsPanel);
	});

	context.subscriptions.push(disposable, statisticsCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
