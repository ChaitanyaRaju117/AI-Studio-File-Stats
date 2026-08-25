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

function getWorkbookExtensionLabel(extension: string): string {
	if (extension === '[no extension]') {
		return 'NO EXTENSION';
	}

	return extension.replace(/^\./, '').toUpperCase();
}

function groupProjectFiles(stats: ProjectStats): Array<{ extension: string; files: FileStats[]; totalLines: number }> {
	const fileGroups = new Map<string, FileStats[]>();
	for (const file of stats.files) {
		const group = fileGroups.get(file.extension) ?? [];
		group.push(file);
		fileGroups.set(file.extension, group);
	}

	return [...fileGroups.entries()]
		.sort(([first], [second]) => first.localeCompare(second))
		.map(([extension, files]) => ({
			extension,
			files: [...files].sort((first, second) => fileDisplayPath(first).localeCompare(fileDisplayPath(second))),
			totalLines: files.reduce((total, file) => total + file.lines, 0),
		}));
}

export function buildProjectStatsCsv(stats: ProjectStats): string {
	const rows: string[] = [];
	const groups = groupProjectFiles(stats);
	const fileTypeCount = new Set(stats.files.map((file) => file.extension)).size;
	const projectName = vscode.workspace.name ?? 'Project';

	rows.push('PROJECT STATISTICS REPORT');
	rows.push('');
	rows.push('Project Name,Value');
	rows.push(`Project Name,${escapeCsvCell(projectName)}`);
	rows.push(`Total Files,${stats.files.length}`);
	rows.push(`Total Lines,${stats.totalLines}`);
	rows.push(`File Types,${fileTypeCount}`);
	rows.push('');
	rows.push('FILE TYPE SUMMARY');
	rows.push('File Type,Number of Files,Total Lines');

	for (const group of groups) {
		rows.push(`${escapeCsvCell(getWorkbookExtensionLabel(group.extension))},${group.files.length},${group.totalLines}`);
	}

	rows.push('');
	rows.push('DETAILED FILE BREAKDOWN');

	for (const group of groups) {
		rows.push(`${escapeCsvCell(`${getWorkbookExtensionLabel(group.extension)} FILES - ${group.files.length} FILE${group.files.length === 1 ? '' : 'S'}`)},,`);
		rows.push('File,Lines,');
		for (const file of group.files) {
			rows.push(`${escapeCsvCell(fileDisplayPath(file))},${file.lines},`);
		}
		rows.push('');
	}

	return rows.join('\r\n');
}
async function renderStatistics(panel: vscode.WebviewPanel): Promise<void> {
	const stats = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Analyzing project statistics...' },
		() => collectProjectStats(),
	);
	const csvContent = buildProjectStatsCsv(stats);
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
			.map(([extension, files]) => `<details class="file-group" data-label="${escapeHtml(extension)}" data-files="${files.length}" data-lines="${files.reduce((total, file) => total + file.lines, 0)}"><summary><span>${escapeHtml(extension)}</span><span class="group-count">${files.length} files / ${files.reduce((total, file) => total + file.lines, 0)} lines</span></summary><ul>${files
				.map((file) => `<li data-name="${escapeHtml(file.name.toLowerCase())}" data-path="${escapeHtml(fileDisplayPath(file).toLowerCase())}"><span class="file-meta"><span class="file-name">${escapeHtml(file.name)}</span>${file.directory ? `<span class="file-dir">${escapeHtml(file.directory)}</span>` : ''}</span><strong>${file.lines} lines</strong></li>`)
				.join('')}</ul></details>`)
			.join('');
		return `<article class="area" data-area="${area.toLowerCase()}"><div class="area-heading"><h2>${area}</h2><span>${areaFiles.length} files / ${areaLines} lines</span></div>${groupsHtml || '<p class="empty">No files found.</p>'}</article>`;
	}).join('');

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
.filter-box { position: relative; }
.filter-box select { appearance: none; background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; color: var(--vscode-foreground); cursor: pointer; font: inherit; padding: 9px 32px 9px 34px; }
.filter-box svg { left: 10px; pointer-events: none; position: absolute; top: 50%; transform: translateY(-50%); }
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
.area { border: 1px solid var(--vscode-panel-border); border-radius: 12px; margin: 12px 0; padding: 0 16px 12px; }
.area-heading { align-items: baseline; border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; }
.area-heading h2 { font-size: 16px; margin: 14px 0 10px; }
.area-heading span, .group-count { color: var(--vscode-descriptionForeground); font-size: 12px; }
details { border-bottom: 1px solid var(--vscode-panel-border); }
details:last-child { border-bottom: 0; }
summary { cursor: pointer; display: flex; justify-content: space-between; list-style: none; padding: 11px 2px; }
summary::-webkit-details-marker { display: none; }
summary::before { content: '›'; display: inline-block; margin-right: 8px; transition: transform .15s ease; }
details[open] summary::before { transform: rotate(90deg); }
summary > span:first-of-type { flex: 1; }
ul { list-style: none; margin: 0; padding: 0 0 4px 18px; }
li { display: flex; gap: 16px; justify-content: space-between; overflow-wrap: anywhere; padding: 7px 0; }
li[hidden], .file-group[hidden], .area[hidden] { display: none !important; }
.file-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.file-dir { color: var(--vscode-descriptionForeground); font-size: 12px; }
li strong { color: var(--vscode-textPreformat-foreground); white-space: nowrap; }
.empty { color: var(--vscode-descriptionForeground); }
@media (max-width: 760px) {
	.topbar, .files-header { align-items: stretch; flex-direction: column; }
	.topbar-actions, .files-toolbar { justify-content: stretch; }
	.search-box, .filter-box, .filter-box select, .ghost-button, .refresh-button { width: 100%; }
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
		<label class="filter-box"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12L9.5 9.2V13l-3 1.5V9.2L2 4z" stroke="currentColor" stroke-linejoin="round"/></svg><select id="area-filter" aria-label="Filter by area"><option value="all">Filter</option><option value="frontend">Frontend</option><option value="backend">Backend</option><option value="other">Other</option></select></label>
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
		<label>Sort by: <select id="sort-by" aria-label="Sort files"><option value="type">File Type</option><option value="files">File count</option><option value="lines">Line count</option></select></label>
		<button id="download-csv" class="ghost-button" type="button"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v7M5.5 7.5L8 10l2.5-2.5M3.5 13h9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>Export</button>
	</div>
</div>
${areaHtml}
</main>
<script>
const vscode = acquireVsCodeApi();
const search = document.getElementById('search');
const areaFilter = document.getElementById('area-filter');
const sortBy = document.getElementById('sort-by');
const csvContent = ${JSON.stringify(csvContent)};
function filterFiles() {
	const query = search.value.trim().toLowerCase();
	const area = areaFilter.value;
	document.querySelectorAll('.area').forEach((areaElement) => {
		const matchesArea = area === 'all' || areaElement.dataset.area === area;
		let visibleFiles = 0;
		let bestAreaScore = 99;
		areaElement.querySelectorAll('.file-group').forEach((group) => {
			let groupVisible = 0;
			let bestGroupScore = 99;
			const files = [...group.querySelectorAll('li')];
			files.forEach((file) => {
				const name = file.dataset.name || '';
				const path = file.dataset.path || '';
				let score = 99;
				if (!query) {
					score = 4;
				} else if (name === query || path === query || path.endsWith('/' + query)) {
					score = 0;
				} else if (name.startsWith(query)) {
					score = 1;
				} else if (name.includes(query)) {
					score = 2;
				} else if (path.includes(query)) {
					score = 3;
				}
				const visible = matchesArea && score < 99;
				file.hidden = !visible;
				file.dataset.score = String(score);
				if (visible) {
					groupVisible++;
					bestGroupScore = Math.min(bestGroupScore, score);
				}
			});
			files.sort((first, second) => Number(first.dataset.score) - Number(second.dataset.score) || (first.dataset.name || '').localeCompare(second.dataset.name || ''));
			files.forEach((file) => file.parentElement.appendChild(file));
			group.hidden = groupVisible === 0;
			group.open = query.length > 0 && groupVisible > 0;
			group.dataset.score = String(bestGroupScore);
			if (groupVisible > 0) {
				visibleFiles += groupVisible;
				bestAreaScore = Math.min(bestAreaScore, bestGroupScore);
			}
		});
		const groups = [...areaElement.querySelectorAll('.file-group')];
		if (query) {
			groups.sort((first, second) => Number(first.dataset.score) - Number(second.dataset.score) || (first.dataset.label || '').localeCompare(second.dataset.label || ''));
			groups.forEach((group) => areaElement.appendChild(group));
		}
		areaElement.hidden = visibleFiles === 0;
		areaElement.dataset.score = String(bestAreaScore);
	});
	if (query) {
		const areas = [...document.querySelectorAll('.area')];
		areas.sort((first, second) => Number(first.dataset.score) - Number(second.dataset.score));
		areas.forEach((areaElement) => areaElement.parentElement.appendChild(areaElement));
	} else {
		document.querySelectorAll('.file-group').forEach((group) => {
			const files = [...group.querySelectorAll('li')];
			files.sort((first, second) => (first.dataset.path || '').localeCompare(second.dataset.path || ''));
			files.forEach((file) => file.parentElement.appendChild(file));
		});
		sortGroups();
	}
}
function sortGroups() {
	const mode = sortBy.value;
	document.querySelectorAll('.area').forEach((areaElement) => {
		const groups = [...areaElement.querySelectorAll('.file-group')];
		groups.sort((first, second) => {
			if (mode === 'lines') return Number(second.dataset.lines) - Number(first.dataset.lines);
			if (mode === 'files') return Number(second.dataset.files) - Number(first.dataset.files);
			return (first.dataset.label || '').localeCompare(second.dataset.label || '');
		});
		groups.forEach((group) => areaElement.appendChild(group));
	});
}
search.addEventListener('input', filterFiles);
areaFilter.addEventListener('change', filterFiles);
sortBy.addEventListener('change', sortGroups);
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
				frontend: 0,
				backend: 0,
				other: 0,
			});
			return;
		}

		const stats = await collectProjectStats();
		this.view.webview.html = renderSidebarHtml({
			hasWorkspace: true,
			totalFiles: stats.files.length,
			totalLines: stats.totalLines,
			frontend: stats.files.filter((file) => file.area === 'Frontend').length,
			backend: stats.files.filter((file) => file.area === 'Backend').length,
			other: stats.files.filter((file) => file.area === 'Other').length,
		});
	}
}

function renderSidebarHtml(summary: {
	hasWorkspace: boolean;
	totalFiles: number;
	totalLines: number;
	frontend: number;
	backend: number;
	other: number;
}): string {
	const body = summary.hasWorkspace
		? `<div class="metric"><strong>${summary.totalFiles}</strong>Total files</div>
<div class="metric"><strong>${summary.totalLines}</strong>Total lines</div>
<ul>
<li><span>Frontend</span><strong>${summary.frontend}</strong></li>
<li><span>Backend</span><strong>${summary.backend}</strong></li>
<li><span>Other</span><strong>${summary.other}</strong></li>
</ul>
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

const INSTALL_PROMPT_KEY = 'aicount.hasShownInstallWelcome';

async function openAicountSidebar(): Promise<void> {
	await vscode.commands.executeCommand('workbench.view.extension.aicount');
}

async function showInstallPrompt(context: vscode.ExtensionContext): Promise<void> {
	if (context.globalState.get(INSTALL_PROMPT_KEY)) {
		return;
	}

	const open = { title: 'Open' };
	const close = { title: 'Close', isCloseAffordance: true };
	const choice = await vscode.window.showInformationMessage(
		'aicount is installed. Do you want to see the project structure?',
		{ modal: true, detail: 'Open the report now, or use the aicount icon in the left sidebar later. This message is shown only once.' },
		open,
		close,
	);

	await context.globalState.update(INSTALL_PROMPT_KEY, true);

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
