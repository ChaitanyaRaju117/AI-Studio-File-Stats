// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

export function countLines(content: string): number {
	if (content.length === 0) {
		return 0;
	}

	return content.split(/\r\n|\r|\n/).length;
}

export interface FileStats {
	name: string;
	directory: string;
	extension: string;
	area: FileArea;
	lines: number;
}

export type FileArea = 'Frontend' | 'Backend' | 'Other';

export interface ProjectStats {
	files: FileStats[];
	totalLines: number;
}

let statisticsPanel: vscode.WebviewPanel | undefined;
let statisticsSidebar: StatisticsSidebarProvider | undefined;

const SOURCE_CODE_EXTENSIONS = new Set([
	'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte', '.astro',
	'.py', '.pyi', '.rb', '.erb', '.php', '.java', '.kt', '.kts', '.scala', '.groovy',
	'.clj', '.cljs', '.go', '.rs', '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hh',
	'.cs', '.fs', '.vb', '.swift', '.m', '.mm', '.dart', '.lua', '.pl', '.pm', '.r',
	'.jl', '.ex', '.exs', '.erl', '.hs', '.ml', '.sh', '.bash', '.zsh', '.fish',
	'.ps1', '.psm1', '.bat', '.cmd', '.sql', '.graphql', '.gql', '.proto', '.tf', '.hcl',
	'.html', '.htm', '.css', '.scss', '.sass', '.less', '.styl', '.md', '.mdx', '.rst',
]);

const DATA_CONFIG_EXTENSIONS = new Set([
	'.json', '.json5', '.jsonc', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
	'.config', '.xml', '.plist', '.txt', '.csv', '.tsv',
]);

const SECRET_EXTENSIONS = new Set([
	'.env', '.pem', '.key', '.ppk', '.p8', '.p12', '.pfx', '.crt', '.cer', '.der',
	'.jks', '.keystore', '.truststore', '.kdbx', '.gpg', '.pgp', '.asc', '.ovpn',
	'.mobileprovision', '.xcconfig', '.pubxml', '.publishsettings', '.properties',
	'.tfvars', '.tfstate', '.netrc',
]);

// Java resource bundles share the .properties extension but hold translations, not secrets.
const TRANSLATION_BUNDLE = /^(messages|labels|i18n|text|texts|strings|errors|validationmessages|bundle)([._-][a-z0-9_-]*)?\.properties$|_[a-z]{2}(_[a-z]{2})?\.properties$/;

const SECRET_FILENAMES = new Set([
	'.env', '.netrc', '.npmrc', '.pypirc', '.yarnrc', '.htpasswd', '.pgpass', '.my.cnf',
	'.s3cfg', '.boto', '.dockercfg', '.git-credentials', '.aws-credentials',
	'kubeconfig', 'known_hosts', 'parameters.yml', 'parameters.yaml',
	'google-services.json', 'googleservice-info.plist',
	// A Docker registry writes its basic-auth file without the Apache leading dot.
	'htpasswd', 'htdigest',
]);

const SECRET_FILENAME_PATTERNS = [
	/^\.env(\.|$)/,
	/^\.yarnrc(\.|$)/,
	/^id_[a-z0-9]+$/,
	/^dockerfile(\.|$)/,
	// docker-stack is the Swarm counterpart of docker-compose and carries the same environment values.
	/^docker-(compose|stack)([._-]|$)/,
	/^application([._-].*)?\.ya?ml$/,
	/^bootstrap([._-].*)?\.ya?ml$/,
	/^appsettings([._-].*)?\.json$/,
	/^service[._-]?account[a-z0-9._-]*\.json$/,
	/^wp-config([._-].*)?\.php$/,
	/^(dbconfig|databaseconfig|firebaseconfig)([._-]|$)/,
	/^([a-z0-9]+_)?(settings|config)\.py$/,
	/\.tfvars\.json$/,
	/\.tfstate\.backup$/,
];

// Words that identify the file itself as a secret store, whatever its extension.
const SECRET_WORDS = /(^|[._-])(secret|secrets|credential|credentials|apikey|api_key|api_keys|api-key|api-keys|passwd)([._-]|$)/;

// credentials.model.ts and friends declare a shape rather than holding one.
const TYPE_DECLARATION = /\.(model|models|dto|interface|interfaces|type|types|enum|enums|schema)\.(ts|tsx|js|jsx)$/;

// Words that only imply secrets in configuration/data files, never in source code.
const CONFIG_SECRET_WORDS = /(^|[._-])(config|configuration|conf|settings|password|passwords|private|vault|auth|token)([._-]|$)/;

const CREDENTIAL_DIRECTORIES = /(^|\/)(\.ssh|\.aws|\.gnupg|\.kube|\.docker|\.m2|\.cargo|secret|secrets|credential|credentials|creds|vault|certs|certificates|keys)(\/|$)/;

const CONFIG_DIRECTORIES = /(^|\/)(config|configs|conf|configuration|settings|helm|charts)(\/|$)/;

const GENERATED_DIRECTORIES = /(^|\/)(node_modules|bower_components|vendor|\.git|\.svn|\.hg|dist|build|out|target|obj|\.gradle|\.idea|\.vs|\.vscode-test|__pycache__|\.pytest_cache|\.mypy_cache|\.venv|venv|site-packages|coverage|\.nyc_output|\.next|\.nuxt|\.svelte-kit|\.turbo|\.terraform)(\/|$)/;

const GENERATED_FILENAMES = new Set([
	'.gitignore',
	'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
	'composer.lock', 'gemfile.lock', 'poetry.lock', 'pipfile.lock', 'cargo.lock',
	'podfile.lock', 'packages.lock.json', 'go.sum',
]);

const GENERATED_EXTENSIONS = new Set([
	'.lock', '.map', '.bak', '.old', '.orig', '.rej', '.tmp', '.temp', '.swp', '.log',
]);

const BINARY_EXTENSIONS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.icns', '.webp', '.tif', '.tiff',
	'.psd', '.ai', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.ttc',
	'.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.jar', '.war', '.ear',
	'.nupkg', '.whl', '.egg', '.rpm', '.deb', '.dmg', '.iso',
	'.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.lib', '.obj', '.pdb',
	'.class', '.pyc', '.pyo', '.pyd', '.wasm', '.node',
	'.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac', '.ogg', '.webm', '.mkv', '.m4a',
	'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
	'.db', '.sqlite', '.sqlite3', '.mdb', '.dump', '.pack', '.idx',
	'.dat', '.pkl', '.h5', '.parquet',
]);

function normalizePath(filePath: string): string {
	return filePath.toLowerCase().replaceAll('\\', '/');
}

function fileNameOf(normalizedPath: string): string {
	return normalizedPath.split('/').pop() ?? normalizedPath;
}

function extensionOf(fileName: string): string {
	const lastDot = fileName.lastIndexOf('.');
	return lastDot > 0 ? fileName.slice(lastDot) : '';
}

export function isSensitiveFile(filePath: string): boolean {
	const path = normalizePath(filePath);
	const name = fileNameOf(path);
	const extension = extensionOf(name);

	if (SECRET_FILENAMES.has(name)
		|| (SECRET_EXTENSIONS.has(extension) && !TRANSLATION_BUNDLE.test(name))
		|| (SECRET_WORDS.test(name) && !TYPE_DECLARATION.test(name))
		|| SECRET_FILENAME_PATTERNS.some((pattern) => pattern.test(name))) {
		return true;
	}

	// Django settings packages and Flask instance folders hold SECRET_KEY and database URIs.
	if (/(^|\/)(settings|instance)\/[^/]+\.py$/.test(path)) {
		return true;
	}

	const isSourceCode = SOURCE_CODE_EXTENSIONS.has(extension);
	if (CREDENTIAL_DIRECTORIES.test(path) && !isSourceCode) {
		return true;
	}

	const isConfigData = extension === '' || DATA_CONFIG_EXTENSIONS.has(extension);
	if (!isConfigData) {
		return false;
	}

	return CONFIG_SECRET_WORDS.test(name) || CONFIG_DIRECTORIES.test(path);
}

export function isGeneratedFile(filePath: string): boolean {
	const path = normalizePath(filePath);
	const name = fileNameOf(path);
	const extension = extensionOf(name);

	return GENERATED_FILENAMES.has(name)
		|| GENERATED_EXTENSIONS.has(extension)
		|| BINARY_EXTENSIONS.has(extension)
		|| name.endsWith('.min.js')
		|| name.endsWith('.min.css')
		|| GENERATED_DIRECTORIES.test(path);
}

function looksBinary(content: Uint8Array): boolean {
	return content.subarray(0, 8000).includes(0);
}

// Extensions that settle the question on their own, whichever directory they sit in. A Spring
// controller in a com.example.web package is backend code even though the package is named web.
const FRONTEND_ONLY_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less', '.styl', '.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);
const BACKEND_ONLY_EXTENSIONS = new Set(['.java', '.py', '.rb', '.php', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.go', '.rs', '.kt', '.kts', '.scala', '.groovy', '.cs', '.swift', '.ex', '.exs', '.erl', '.pl', '.sql']);
// Only consulted for extensions that both sides share, such as .ts in an Angular app and a Node service.
const AMBIGUOUS_FRONTEND_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);

// The optional affixes let compound service names such as web-ui or auth-service match.
const FRONTEND_DIRECTORY = /(^|\/)([a-z0-9]+[-_])?(frontend|front-end|client|web|webapp|ui|dashboard|public|pages|components|views|static)([-_][a-z0-9-]+)?(\/|$)/;
const BACKEND_DIRECTORY = /(^|\/)([a-z0-9]+[-_])?(backend|back-end|server|api|apis|service|services|microservice|microservices|worker|workers|controllers|routes|handlers|repository|repositories|daemon)([-_][a-z0-9-]+)?(\/|$)/;

export function classifyFile(filePath: string, extension: string): FileArea {
	const normalizedPath = filePath.toLowerCase().replaceAll('\\', '/');

	if (FRONTEND_ONLY_EXTENSIONS.has(extension)) {
		return 'Frontend';
	}
	if (BACKEND_ONLY_EXTENSIONS.has(extension)) {
		return 'Backend';
	}
	if (FRONTEND_DIRECTORY.test(normalizedPath)) {
		return 'Frontend';
	}
	if (BACKEND_DIRECTORY.test(normalizedPath)) {
		return 'Backend';
	}
	if (AMBIGUOUS_FRONTEND_EXTENSIONS.has(extension)) {
		return 'Frontend';
	}
	return 'Other';
}

async function collectProjectStats(): Promise<ProjectStats> {
	const exclude = '**/{node_modules,bower_components,vendor,.git,.svn,.hg,.venv,venv,__pycache__,.pytest_cache,.mypy_cache,out,dist,build,target,obj,.gradle,.idea,.vs,.vscode-test,coverage,.next,.nuxt,.svelte-kit,.turbo,.terraform}/**';
	const fileUris = await vscode.workspace.findFiles('**/*', exclude);
	const files: FileStats[] = [];

	for (const uri of fileUris) {
		const relativePath = vscode.workspace.asRelativePath(uri, false).replaceAll('\\', '/');
		const displayPath = vscode.workspace.asRelativePath(uri, true).replaceAll('\\', '/');
		const separator = displayPath.lastIndexOf('/');
		const name = separator === -1 ? displayPath : displayPath.slice(separator + 1);
		const directory = separator === -1 ? '' : displayPath.slice(0, separator);
		if (isSensitiveFile(relativePath) || isGeneratedFile(relativePath)) {
			continue;
		}

		const extension = name.includes('.') && !name.startsWith('.')
			? `.${name.split('.').pop()?.toLowerCase()}`
			: '[no extension]';
		if (extension === '[no extension]') {
			continue;
		}

		try {
			const content = await vscode.workspace.fs.readFile(uri);
			if (looksBinary(content)) {
				continue;
			}

			files.push({
				name,
				directory,
				extension,
				area: classifyFile(relativePath, extension),
				lines: countLines(new TextDecoder().decode(content)),
			});
		} catch {
			// Ignore files that cannot be read.
		}
	}

	return {
		files: files.sort((first, second) => fileDisplayPath(first).localeCompare(fileDisplayPath(second))),
		totalLines: files.reduce((total, file) => total + file.lines, 0),
	};
}

function fileDisplayPath(file: FileStats): string {
	return file.directory ? `${file.directory}/${file.name}` : file.name;
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

function escapeCsvCell(value: string): string {
	const escaped = value.replace(/"/g, '""');
	return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
}

function formatCount(value: number): string {
	return value.toLocaleString('en-US');
}

export function buildProjectStatsCsv(stats: ProjectStats): string {
	const rows = [
		`Total Files,${stats.files.length}`,
		`Total Lines,${stats.totalLines}`,
		'',
		'Name,No. of lines',
	];
	for (const file of stats.files) {
		rows.push(`${escapeCsvCell(file.name)},${file.lines}`);
	}
	return rows.join('\r\n');
}
async function renderStatistics(panel: vscode.WebviewPanel): Promise<void> {
	const stats = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Analyzing project statistics...' },
		() => collectProjectStats(),
	);
	const csvContent = buildProjectStatsCsv(stats);
	const rowsHtml = stats.files
		.map((file) => `<tr data-name="${escapeHtml(file.name.toLowerCase())}" data-path="${escapeHtml(fileDisplayPath(file).toLowerCase())}" data-lines="${file.lines}"><td class="sno"></td><td class="file-name">${escapeHtml(file.name)}</td><td class="lines">${formatCount(file.lines)}</td></tr>`)
		.join('');
	const filesHtml = rowsHtml
		? `<div class="table-wrap"><table class="file-table"><thead><tr><th>S.No</th><th>Name</th><th>No. of lines</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`
		: '<p class="empty">No files found.</p>';

	panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { box-sizing: border-box; }
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); line-height: 1.4; margin: 0; padding: 28px clamp(16px, 4vw, 48px) 48px; }
main { max-width: 920px; margin: 0 auto; }
.topbar { align-items: center; display: flex; gap: 16px; justify-content: space-between; margin-bottom: 22px; }
h1 { font-size: 28px; font-weight: 650; letter-spacing: -0.03em; margin: 0; }
.subtitle { color: var(--vscode-descriptionForeground); margin: 4px 0 0; }
.topbar-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.search-box { align-items: center; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 8px; display: flex; gap: 8px; min-width: 220px; padding: 0 12px; }
.search-box svg, .ghost-button svg, .refresh-button svg { flex-shrink: 0; }
.search-box input { background: transparent; border: 0; color: var(--vscode-input-foreground); flex: 1; font: inherit; min-width: 0; outline: none; padding: 9px 0; }
.ghost-button, .refresh-button { align-items: center; border-radius: 8px; cursor: pointer; display: inline-flex; font: inherit; gap: 8px; padding: 9px 14px; }
.ghost-button { background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); color: var(--vscode-foreground); }
.ghost-button:hover { filter: brightness(1.12); }
.refresh-button { background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); }
.refresh-button:hover { background: var(--vscode-button-hoverBackground); }
.refresh-button:disabled { cursor: wait; opacity: 0.72; }
.summary { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 28px; }
.metric { align-items: center; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 12px; display: flex; gap: 14px; padding: 18px 20px; }
.metric-icon { align-items: center; background: color-mix(in srgb, var(--vscode-textLink-foreground) 16%, transparent); border-radius: 10px; color: var(--vscode-textLink-foreground); display: flex; height: 42px; justify-content: center; width: 42px; }
.metric strong { display: block; font-size: 30px; font-weight: 700; letter-spacing: -0.04em; }
.metric span { color: var(--vscode-descriptionForeground); font-size: 13px; }
.files-header { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin-bottom: 10px; }
.files-header h2 { font-size: 16px; margin: 0; }
.files-toolbar { align-items: center; display: flex; gap: 10px; }
.files-toolbar label { align-items: center; color: var(--vscode-descriptionForeground); display: flex; font-size: 13px; gap: 8px; }
.files-toolbar select { background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; color: var(--vscode-foreground); font: inherit; padding: 7px 10px; }
.table-wrap { border: 1px solid var(--vscode-panel-border); border-radius: 12px; overflow: auto; }
.file-table { border-collapse: collapse; width: 100%; }
.file-table th, .file-table td { padding: 8px 10px; text-align: left; vertical-align: top; }
.file-table th { color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.file-table tbody tr { border-top: 1px solid var(--vscode-panel-border); }
.file-table .sno { color: var(--vscode-descriptionForeground); width: 64px; }
.file-table .file-name { overflow-wrap: anywhere; }
.file-table .lines { text-align: right; white-space: nowrap; width: 120px; }
.file-table th:last-child, .file-table td.lines { text-align: right; }
tr[hidden] { display: none !important; }
.empty { color: var(--vscode-descriptionForeground); }
@media (max-width: 760px) {
	.topbar, .files-header { align-items: stretch; flex-direction: column; }
	.topbar-actions, .files-toolbar { justify-content: stretch; }
	.search-box, .ghost-button, .refresh-button { width: 100%; }
	.summary { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<main>
<div class="topbar">
	<div><h1>Project Statistics</h1><p class="subtitle">Overview of files and lines in this workspace</p></div>
	<div class="topbar-actions">
		<label class="search-box"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-linecap="round"/></svg><input id="search" type="search" placeholder="Search files..." aria-label="Search files"></label>
		<button id="refresh" class="refresh-button" type="button"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.4-3.5M13 3.5V6h-2.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>Refresh</button>
	</div>
</div>
<div class="summary">
	<div class="metric"><span class="metric-icon"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 3h7l4 4v10a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 3.5 17V4.5A1.5 1.5 0 0 1 5 3z" stroke="currentColor"/><path d="M12 3v4h4" stroke="currentColor"/></svg></span><div><strong>${formatCount(stats.files.length)}</strong><span>Total files</span></div></div>
	<div class="metric"><span class="metric-icon"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 5L4 10l4 5M12 5l4 5-4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><strong>${formatCount(stats.totalLines)}</strong><span>Total lines</span></div></div>
</div>
<div class="files-header">
	<h2>Files</h2>
	<div class="files-toolbar">
		<label>Sort by: <select id="sort-by" aria-label="Sort files"><option value="name">Name</option><option value="lines">No. of lines</option></select></label>
		<button id="download-csv" class="ghost-button" type="button"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v7M5.5 7.5L8 10l2.5-2.5M3.5 13h9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>Export</button>
	</div>
</div>
${filesHtml}
</main>
<script>
const vscode = acquireVsCodeApi();
const search = document.getElementById('search');
const sortBy = document.getElementById('sort-by');
const csvContent = ${JSON.stringify(csvContent)};
function matchScore(row, query) {
	const name = row.dataset.name || '';
	if (!query) return 4;
	if (name === query) return 0;
	if (name.startsWith(query)) return 1;
	if (name.includes(query)) return 2;
	return 99;
}
function renumberRows() {
	let serial = 1;
	document.querySelectorAll('.file-table tbody tr').forEach((row) => {
		if (row.hidden) return;
		row.querySelector('.sno').textContent = String(serial++);
	});
}
function filterFiles() {
	const query = search.value.trim().toLowerCase();
	const rows = [...document.querySelectorAll('.file-table tbody tr')];
	rows.forEach((row) => {
		const score = matchScore(row, query);
		row.hidden = score === 99;
		row.dataset.score = String(score);
	});
	if (query) {
		rows.sort((first, second) => Number(first.dataset.score) - Number(second.dataset.score) || (first.dataset.name || '').localeCompare(second.dataset.name || ''));
		rows.forEach((row) => row.parentElement.appendChild(row));
	} else {
		sortRows();
		return;
	}
	renumberRows();
}
function sortRows() {
	const mode = sortBy.value;
	const rows = [...document.querySelectorAll('.file-table tbody tr')];
	rows.sort((first, second) => {
		if (mode === 'lines') return Number(second.dataset.lines) - Number(first.dataset.lines);
		return (first.dataset.name || '').localeCompare(second.dataset.name || '');
	});
	rows.forEach((row) => row.parentElement.appendChild(row));
	renumberRows();
}
search.addEventListener('input', filterFiles);
sortBy.addEventListener('change', () => {
	if (search.value.trim()) {
		filterFiles();
		return;
	}
	sortRows();
});
renumberRows();
document.getElementById('refresh').addEventListener('click', (event) => {
	event.currentTarget.disabled = true;
	vscode.postMessage({ type: 'refresh' });
});
document.getElementById('download-csv').addEventListener('click', () => {
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'project-statistics.csv';
	link.click();
	URL.revokeObjectURL(url);
});
</script>
</body>
</html>`;
}

class StatisticsSidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'aicount.sidebar';
	private view?: vscode.WebviewView;

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.onDidReceiveMessage((message: { type?: string }) => {
			if (message.type === 'openReport') {
				void vscode.commands.executeCommand('poc.projectStatistics');
			}
		});
		void this.refresh();
	}

	async refresh(): Promise<void> {
		if (!this.view) {
			return;
		}

		if (!vscode.workspace.workspaceFolders?.length) {
			this.view.webview.html = renderSidebarHtml({
				hasWorkspace: false,
				totalFiles: 0,
				totalLines: 0,
			});
			return;
		}

		const stats = await collectProjectStats();
		this.view.webview.html = renderSidebarHtml({
			hasWorkspace: true,
			totalFiles: stats.files.length,
			totalLines: stats.totalLines,
		});
	}
}

function renderSidebarHtml(summary: {
	hasWorkspace: boolean;
	totalFiles: number;
	totalLines: number;
}): string {
	const body = summary.hasWorkspace
		? `<div class="metric"><strong>${summary.totalFiles}</strong>Total files</div>
<div class="metric"><strong>${summary.totalLines}</strong>Total lines</div>
<button id="open-report" type="button">Open full report</button>`
		: '<p class="empty">Open a project folder to view statistics.</p>';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { color: var(--vscode-foreground); background: transparent; font-family: var(--vscode-font-family); line-height: 1.4; margin: 0; padding: 12px; }
.metric { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); margin-bottom: 8px; padding: 12px; }
.metric strong { color: var(--vscode-textLink-foreground); display: block; font-size: 22px; }
ul { list-style: none; margin: 12px 0; padding: 0; }
li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
button { background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); cursor: pointer; font: inherit; margin-top: 8px; padding: 8px 12px; width: 100%; }
button:hover { background: var(--vscode-button-hoverBackground); }
.empty { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
${body}
<script>
const vscode = acquireVsCodeApi();
document.getElementById('open-report')?.addEventListener('click', () => {
	vscode.postMessage({ type: 'openReport' });
});
</script>
</body>
</html>`;
}

function welcomeMarkerUri(context: vscode.ExtensionContext): vscode.Uri {
	return vscode.Uri.joinPath(context.extensionUri, '.welcome-shown');
}

async function hasShownWelcomeForThisInstall(context: vscode.ExtensionContext): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(welcomeMarkerUri(context));
		return true;
	} catch {
		return false;
	}
}

async function markWelcomeShown(context: vscode.ExtensionContext): Promise<void> {
	try {
		await vscode.workspace.fs.writeFile(welcomeMarkerUri(context), new TextEncoder().encode('1'));
	} catch {
		// Ignore if the install folder is not writable.
	}
}

async function openAicountSidebar(): Promise<void> {
	await vscode.commands.executeCommand('workbench.view.extension.aicount');
}

async function showInstallPrompt(context: vscode.ExtensionContext): Promise<void> {
	const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;
	if (!isDevelopment && await hasShownWelcomeForThisInstall(context)) {
		return;
	}

	const open = { title: 'Open' };
	const close = { title: 'Close', isCloseAffordance: true };
	const choice = await vscode.window.showInformationMessage(
		'aicount is installed. Do you want to see the project structure?',
		{ modal: true, detail: 'Open the report now, or use the aicount icon in the left sidebar later. This message is shown once per install.' },
		open,
		close,
	);

	if (!isDevelopment) {
		await markWelcomeShown(context);
	}

	if (choice === open) {
		await openAicountSidebar();
		await showStatisticsPanel(context);
	}
}

async function showStatisticsPanel(context: vscode.ExtensionContext): Promise<void> {
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
	statisticsPanel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
		if (message.type !== 'refresh' || !statisticsPanel) {
			return;
		}

		await renderStatistics(statisticsPanel);
		await statisticsSidebar?.refresh();
	});
	statisticsPanel.onDidDispose(() => statisticsPanel = undefined, null, context.subscriptions);
	await renderStatistics(statisticsPanel);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "poc" is now active!');

	const sidebarProvider = new StatisticsSidebarProvider();
	statisticsSidebar = sidebarProvider;
	const disposable = vscode.commands.registerCommand('poc.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from poc!');
	});
	const statisticsCommand = vscode.commands.registerCommand('poc.projectStatistics', () => showStatisticsPanel(context));
	const refreshCommand = vscode.commands.registerCommand('poc.refreshSidebar', () => sidebarProvider.refresh());

	context.subscriptions.push(
		disposable,
		statisticsCommand,
		refreshCommand,
		vscode.window.registerWebviewViewProvider(StatisticsSidebarProvider.viewType, sidebarProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	);

	void showInstallPrompt(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
