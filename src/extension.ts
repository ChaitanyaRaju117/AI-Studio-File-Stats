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

interface FileStats {
	name: string;
	extension: string;
	area: FileArea;
	lines: number;
}

export type FileArea = 'Frontend' | 'Backend' | 'Other';

interface ProjectStats {
	files: FileStats[];
	totalLines: number;
}

let statisticsPanel: vscode.WebviewPanel | undefined;

export function isSensitiveFile(filePath: string): boolean {
	const lowerCasePath = filePath.toLowerCase().replaceAll('\\', '/');
	const lowerCaseName = lowerCasePath.split('/').pop() ?? lowerCasePath;
	const sensitiveName = /(config|configuration|secret|secrets|credential|credentials|password|passwd|token|auth|private|connection|apikey|api-key|key)/;
	const sensitiveDirectory = /(^|\/)(config|configs|secrets|credentials|private|certificates|keys|target|build|\.gradle|\.idea)(\/|$)/;
	return lowerCaseName === '.dockerignore'
		|| lowerCaseName === '.env'
		|| lowerCaseName.endsWith('.env')
		|| lowerCaseName.startsWith('.env.')
		|| lowerCaseName === '.gitignore'
		|| lowerCaseName === '.npmrc'
		|| lowerCaseName === '.pypirc'
		|| lowerCaseName === '.yarnrc'
		|| lowerCaseName === 'application.properties'
		|| /^application-.*\.properties$/.test(lowerCaseName)
		|| lowerCaseName === 'application.yml'
		|| lowerCaseName === 'application.yaml'
		|| lowerCaseName === 'secrets.properties'
		|| lowerCaseName === 'secrets.yml'
		|| lowerCaseName === 'secrets.yaml'
		|| lowerCaseName === 'credentials.properties'
		|| lowerCaseName === 'credentials.yml'
		|| lowerCaseName === 'credentials.yaml'
		|| lowerCaseName === 'aws.properties'
		|| lowerCaseName === 'gcp-credentials.json'
		|| lowerCaseName === 'azure-credentials.json'
		|| lowerCaseName === 'kubeconfig'
		|| lowerCaseName === 'dockerfile'
		|| lowerCaseName.startsWith('dockerfile.')
		|| lowerCaseName.startsWith('docker-compose.')
		|| lowerCaseName === 'credentials.json'
		|| lowerCaseName === 'secrets.json'
		|| lowerCaseName === 'service-account.json'
		|| lowerCaseName === 'id_rsa'
		|| lowerCaseName === 'id_ed25519'
		|| lowerCaseName === 'known_hosts'
		|| lowerCaseName.endsWith('.pem')
		|| lowerCaseName.endsWith('.key')
		|| lowerCaseName.endsWith('.p12')
		|| lowerCaseName.endsWith('.pfx')
		|| lowerCaseName.endsWith('.crt')
		|| lowerCaseName.endsWith('.cer')
		|| lowerCaseName.endsWith('.jks')
		|| lowerCaseName.endsWith('.keystore')
		|| lowerCaseName.endsWith('.truststore')
		|| lowerCaseName.endsWith('.tfvars')
		|| lowerCaseName.endsWith('.class')
		|| lowerCaseName.endsWith('.sqlite')
		|| lowerCaseName.endsWith('.sqlite3')
		|| lowerCaseName.endsWith('.db')
		|| lowerCaseName.endsWith('.dump')
		|| lowerCaseName.endsWith('.bak')
		|| lowerCaseName.endsWith('.tfstate')
		|| lowerCaseName.endsWith('.tfstate.backup')
		|| lowerCasePath.includes('/.aws/credentials')
		|| lowerCasePath.includes('/.aws/config')
		|| lowerCasePath.includes('/.kube/config')
		|| sensitiveName.test(lowerCaseName)
		|| sensitiveDirectory.test(lowerCasePath)
		|| lowerCaseName.endsWith('.lock');
}

export function classifyFile(filePath: string, extension: string): FileArea {
	const normalizedPath = filePath.toLowerCase().replaceAll('\\', '/');
	const frontendDirectory = /(^|\/)(frontend|front-end|client|web|ui|public|pages|components)(\/|$)/;
	const backendDirectory = /(^|\/)(backend|back-end|server|api|services|controllers|routes)(\/|$)/;
	const frontendExtension = new Set(['.css', '.scss', '.sass', '.less', '.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro']);
	const backendExtension = new Set(['.java', '.py', '.rb', '.php', '.c', '.cpp', '.cc', '.h', '.hpp', '.go', '.rs', '.kt', '.kts', '.cs', '.swift']);

	if (frontendDirectory.test(normalizedPath)) {
		return 'Frontend';
	}
	if (backendDirectory.test(normalizedPath)) {
		return 'Backend';
	}
	if (frontendExtension.has(extension)) {
		return 'Frontend';
	}
	if (backendExtension.has(extension)) {
		return 'Backend';
	}
	return 'Other';
}

async function collectProjectStats(): Promise<ProjectStats> {
	const exclude = '**/{node_modules,.git,.venv,venv,__pycache__,out,dist,build,.vscode-test}/**';
	const fileUris = await vscode.workspace.findFiles('**/*', exclude);
	const files: FileStats[] = [];

	for (const uri of fileUris) {
		const name = uri.path.split('/').pop() ?? uri.fsPath;
		if (isSensitiveFile(uri.path)) {
			continue;
		}

		try {
			const content = await vscode.workspace.fs.readFile(uri);
			const extension = name.includes('.') && !name.startsWith('.')
				? `.${name.split('.').pop()?.toLowerCase()}`
				: '[no extension]';
			files.push({
				name,
				extension,
				area: classifyFile(uri.path, extension),
				lines: countLines(new TextDecoder().decode(content)),
			});
		} catch {
			// Ignore files that cannot be read.
		}
	}

	return {
		files: files.sort((first, second) => first.name.localeCompare(second.name)),
		totalLines: files.reduce((total, file) => total + file.lines, 0),
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
	const areas: FileArea[] = ['Frontend', 'Backend', 'Other'];
	const areaHtml = areas.map((area) => {
		const areaFiles = stats.files.filter((file) => file.area === area);
		const areaLines = areaFiles.reduce((total, file) => total + file.lines, 0);
		const fileGroups = new Map<string, FileStats[]>();
		for (const file of areaFiles) {
			const group = fileGroups.get(file.extension) ?? [];
			group.push(file);
			fileGroups.set(file.extension, group);
		}
		const groupsHtml = [...fileGroups.entries()]
			.sort(([first], [second]) => first.localeCompare(second))
			.map(([extension, files]) => `<section><h3>${escapeHtml(extension)} <span>${files.length}</span></h3><ul>${files
				.map((file) => `<li><span>${escapeHtml(file.name)}</span><strong>${file.lines} lines</strong></li>`)
				.join('')}</ul></section>`)
			.join('');
		return `<article><h2>${area} <span>${areaFiles.length} files / ${areaLines} lines</span></h2>${groupsHtml || '<p class="empty">No files found.</p>'}</article>`;
	}).join('');

	panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 20px; }
h1 { font-size: 24px; margin: 0 0 20px; }
h2 { border-bottom: 1px solid var(--vscode-panel-border); font-size: 14px; margin: 28px 0 8px; padding-bottom: 6px; text-transform: uppercase; letter-spacing: .08em; }
h3 { font-size: 13px; margin: 16px 0 6px; }
h2 span { float: right; opacity: .7; }
h3 span { float: right; opacity: .7; }
.summary { display: flex; gap: 12px; flex-wrap: wrap; }
.metric { border: 1px solid var(--vscode-panel-border); padding: 14px; min-width: 130px; }
.metric strong { display: block; font-size: 28px; color: var(--vscode-textLink-foreground); }
ul { list-style: none; padding: 0; margin: 0; }
li { border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 16px; justify-content: space-between; padding: 8px 0; }
li strong { color: var(--vscode-textPreformat-foreground); }
.empty { opacity: .7; }
</style>
</head>
<body>
<h1>Project Statistics</h1>
<div class="summary">
<div class="metric"><strong>${stats.files.length}</strong>Total files</div>
<div class="metric"><strong>${stats.totalLines}</strong>Total lines</div>
</div>
${areaHtml}
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
		await renderStatistics(statisticsPanel);
	});

	context.subscriptions.push(disposable, statisticsCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
