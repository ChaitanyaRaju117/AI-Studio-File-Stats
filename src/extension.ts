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
		const relativePath = vscode.workspace.asRelativePath(uri, false);
		const name = relativePath.split(/[\\/]/).pop() ?? uri.fsPath;
		if (isSensitiveFile(relativePath) || isGeneratedFile(relativePath)) {
			continue;
		}

		try {
			const content = await vscode.workspace.fs.readFile(uri);
			if (looksBinary(content)) {
				continue;
			}

			const extension = name.includes('.') && !name.startsWith('.')
				? `.${name.split('.').pop()?.toLowerCase()}`
				: '[no extension]';
			files.push({
				name,
				extension,
				area: classifyFile(relativePath, extension),
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

function escapeCsvCell(value: string): string {
	const escaped = value.replace(/"/g, '""');
	return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
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
			files: [...files].sort((first, second) => first.name.localeCompare(second.name)),
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
			rows.push(`${escapeCsvCell(file.name)},${file.lines},`);
		}
		rows.push('');
	}

	return rows.join('\r\n');
}
async function renderStatistics(panel: vscode.WebviewPanel): Promise<void> {
	const stats = await collectProjectStats();
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
			.map(([extension, files]) => `<details class="file-group" data-extension="${escapeHtml(extension)}"><summary><span>${escapeHtml(extension)}</span><span class="group-count">${files.length} files / ${files.reduce((total, file) => total + file.lines, 0)} lines</span></summary><ul>${files
				.map((file) => `<li data-file-name="${escapeHtml(file.name)}" data-lines="${file.lines}"><span>${escapeHtml(file.name)}</span><strong>${file.lines} lines</strong></li>`)
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
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); line-height: 1.4; margin: 0; padding: 28px clamp(18px, 4vw, 56px); }
main { max-width: 1120px; margin: 0 auto; }
.topbar { align-items: flex-start; display: flex; gap: 20px; justify-content: space-between; margin-bottom: 16px; }
.header-copy h1 { font-size: 26px; margin: 0; }
.subtitle { color: var(--vscode-descriptionForeground); margin: 4px 0 0; }
.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; justify-content: flex-end; }
.toolbar-group { position: relative; }
.search-input { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 10px; color: var(--vscode-input-foreground); font: inherit; min-width: 210px; padding: 9px 12px; }
.search-input::placeholder { color: var(--vscode-descriptionForeground); }
.toolbar-button { align-items: center; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(96, 165, 250, 0.22); border-radius: 10px; color: var(--vscode-foreground); cursor: pointer; display: inline-flex; gap: 8px; font: inherit; height: 38px; padding: 0 14px; transition: background 120ms ease, border-color 120ms ease, transform 120ms ease; }
.toolbar-button:hover { background: rgba(59, 130, 246, 0.14); border-color: rgba(96, 165, 250, 0.34); }
.toolbar-button svg { color: #4da3ff; flex: 0 0 auto; }
.refresh-button { background: linear-gradient(180deg, rgba(37, 99, 235, 0.68), rgba(30, 64, 175, 0.72)); border: 1px solid rgba(96, 165, 250, 0.24); color: #ffffff; }
.refresh-button:hover { background: linear-gradient(180deg, rgba(37, 99, 235, 0.78), rgba(30, 64, 175, 0.8)); }
.refresh-button svg { color: #dbeafe; }
.files-bar { align-items: center; display: flex; gap: 14px; justify-content: space-between; margin: 16px 0 10px; }
.files-actions { align-items: center; display: flex; gap: 10px; justify-content: flex-end; }
.sort-label { color: var(--vscode-descriptionForeground); font-size: 13px; }
.sort-select { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 10px; color: var(--vscode-input-foreground); font: inherit; min-width: 142px; padding: 9px 12px; }
.export-button { min-width: 96px; }
.summary-cards { display: flex; gap: 10px; margin-bottom: 16px; }
.stat-card { align-items: center; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 12px; display: flex; flex: 1; gap: 12px; min-width: 0; padding: 10px 12px; }
.stat-icon { align-items: center; background: rgba(59, 130, 246, 0.08); border-radius: 10px; color: #4da3ff; display: inline-flex; flex: 0 0 auto; height: 30px; justify-content: center; width: 30px; }
.stat-content { min-width: 0; }
.stat-value { color: var(--vscode-textLink-foreground); font-size: 24px; font-weight: 700; line-height: 1.05; }
.stat-label { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 2px; }
.filter-menu { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 10px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24); min-width: 180px; padding: 6px; position: absolute; right: 0; top: calc(100% + 8px); z-index: 10; }
.filter-menu button { background: transparent; border: 0; border-radius: 8px; color: var(--vscode-foreground); cursor: pointer; display: block; font: inherit; padding: 8px 10px; text-align: left; width: 100%; }
.filter-menu button:hover, .filter-menu button[aria-pressed="true"] { background: rgba(59, 130, 246, 0.12); }
.section-title { font-size: 14px; letter-spacing: .08em; margin: 0 0 10px; text-transform: uppercase; }
.area { border: 1px solid var(--vscode-panel-border); margin: 12px 0; padding: 0 16px 12px; }
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
li strong { color: var(--vscode-textPreformat-foreground); white-space: nowrap; }
.empty { color: var(--vscode-descriptionForeground); }
@media (max-width: 780px) { .topbar { align-items: start; flex-direction: column; } .toolbar { flex-wrap: wrap; justify-content: flex-start; width: 100%; } .search-input { min-width: 0; width: 100%; } .files-bar { align-items: flex-start; flex-direction: column; } .files-actions { justify-content: flex-start; width: 100%; } .summary-cards { flex-direction: column; } }
</style>
</head>
<body>
<main>
<div class="topbar">
<div class="header-copy">
<h1>Project Statistics</h1>
<p class="subtitle">Overview of files and lines in this workspace</p>
</div>
<div class="toolbar">
<div class="toolbar-group"><input id="search" class="search-input" type="search" placeholder="Search files..." aria-label="Search files"></div>
<div class="toolbar-group">
<button id="filter-button" class="toolbar-button" type="button" aria-haspopup="menu" aria-expanded="false">
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 3h11L9.5 8v4.5l-3 1.5V8L2.5 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
<span id="filter-button-label">Filter</span>
</button>
<div id="filter-menu" class="filter-menu" role="menu" hidden>
<button type="button" data-area="all" aria-pressed="true">All areas</button>
<button type="button" data-area="frontend" aria-pressed="false">Frontend</button>
<button type="button" data-area="backend" aria-pressed="false">Backend</button>
<button type="button" data-area="other" aria-pressed="false">Other</button>
</div>
</div>
<button id="refresh-button" class="toolbar-button refresh-button" type="button" aria-label="Refresh project statistics">
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M12.8 4.7A5.5 5.5 0 1 0 13.5 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2.5v2.5h-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5 9.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span>Refresh</span>
</button>
</div>
</div>
<div class="summary-cards">
<div class="stat-card">
<div class="stat-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M2.5 2.5h7L13.5 6v7.5h-11V2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 2.5V6H13.5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></div>
<div class="stat-content"><div class="stat-value">${stats.files.length}</div><div class="stat-label">Total files</div></div>
</div>
<div class="stat-card">
<div class="stat-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h2.25M6.5 4.5h6.5M3 8h2.25M6.5 8h6.5M3 11.5h2.25M6.5 11.5h6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
<div class="stat-content"><div class="stat-value">${stats.totalLines}</div><div class="stat-label">Total lines</div></div>
</div>
</div>
<div class="files-bar">
<h2 class="section-title">Files</h2>
<div class="files-actions">
<label class="sort-label" for="sort-by">Sort by:</label>
<select id="sort-by" class="sort-select" aria-label="Sort by">
<option value="file-type" selected>File Type</option>
<option value="file-count">File Count</option>
<option value="total-lines">Total Lines</option>
</select>
<button id="export-button" class="toolbar-button export-button" type="button">
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.5v7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="m5.5 7.5 2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 12.5h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
<span>Export</span>
</button>
</div>
</div>
${areaHtml}
</main>
<script>
const vscode = acquireVsCodeApi();
const search = document.getElementById('search');
const filterButton = document.getElementById('filter-button');
const filterButtonLabel = document.getElementById('filter-button-label');
const filterMenu = document.getElementById('filter-menu');
const refreshButton = document.getElementById('refresh-button');
const sortBy = document.getElementById('sort-by');
const exportButton = document.getElementById('export-button');
const csvContent = ${JSON.stringify(csvContent)};
let activeArea = 'all';
function sortGroups() {
	const mode = sortBy.value;
	document.querySelectorAll('.area').forEach((areaElement) => {
		const heading = areaElement.querySelector('.area-heading');
		const groups = Array.from(areaElement.querySelectorAll('.file-group'));
		groups.sort((first, second) => {
			if (mode === 'file-count') {
				const firstCount = Number(first.querySelectorAll('li').length);
				const secondCount = Number(second.querySelectorAll('li').length);
				if (firstCount !== secondCount) return secondCount - firstCount;
				return (first.dataset.extension || '').localeCompare(second.dataset.extension || '');
			}
			if (mode === 'total-lines') {
				const firstLines = Array.from(first.querySelectorAll('li')).reduce((total, file) => total + Number(file.dataset.lines || '0'), 0);
				const secondLines = Array.from(second.querySelectorAll('li')).reduce((total, file) => total + Number(file.dataset.lines || '0'), 0);
				if (firstLines !== secondLines) return secondLines - firstLines;
				return (first.dataset.extension || '').localeCompare(second.dataset.extension || '');
			}
			return (first.dataset.extension || '').localeCompare(second.dataset.extension || '');
		});
		groups.forEach((group) => areaElement.appendChild(group));
		if (heading) areaElement.insertBefore(heading, areaElement.firstChild);
	});
}
function setActiveArea(area) {
	activeArea = area;
	filterButtonLabel.textContent = area === 'all'
		? 'Filter'
		: 'Filter: ' + area.charAt(0).toUpperCase() + area.slice(1);
	filterMenu.querySelectorAll('button[data-area]').forEach((button) => {
		button.setAttribute('aria-pressed', String(button.dataset.area === area));
	});
	filterMenu.hidden = true;
	filterButton.setAttribute('aria-expanded', 'false');
	filterFiles();
}
function toggleFilterMenu(forceOpen) {
	const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : filterMenu.hidden;
	filterMenu.hidden = !shouldOpen;
	filterButton.setAttribute('aria-expanded', String(shouldOpen));
}
function filterFiles() {
	const query = search.value.toLowerCase();
	document.querySelectorAll('.area').forEach((areaElement) => {
		const matchesArea = activeArea === 'all' || areaElement.dataset.area === activeArea;
		let visibleFiles = 0;
		areaElement.querySelectorAll('.file-group').forEach((group) => {
			let groupVisible = 0;
			group.querySelectorAll('li').forEach((file) => {
				const visible = matchesArea && file.textContent.toLowerCase().includes(query);
				file.hidden = !visible;
				if (visible) groupVisible++;
			});
			group.hidden = groupVisible === 0;
			if (groupVisible > 0) visibleFiles += groupVisible;
		});
		areaElement.hidden = visibleFiles === 0;
	});
}
function downloadCsv() {
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = 'project-statistics.csv';
	anchor.style.display = 'none';
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}
search.addEventListener('input', filterFiles);
filterButton.addEventListener('click', () => toggleFilterMenu());
filterMenu.querySelectorAll('button[data-area]').forEach((button) => {
	button.addEventListener('click', () => setActiveArea(button.dataset.area || 'all'));
});
document.addEventListener('click', (event) => {
	const target = event.target;
	if (!(target instanceof Node) || (!filterMenu.contains(target) && target !== filterButton && !filterButton.contains(target))) {
		toggleFilterMenu(false);
	}
});
refreshButton.addEventListener('click', () => {
	vscode.postMessage({ type: 'refresh' });
});
sortBy.addEventListener('change', () => {
	sortGroups();
	filterFiles();
});
exportButton.addEventListener('click', downloadCsv);
sortGroups();
setActiveArea('all');
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

const INSTALL_PROMPT_KEY = 'aicount.hasShownInstallPrompt';

async function showInstallPrompt(context: vscode.ExtensionContext): Promise<void> {
	if (context.globalState.get(INSTALL_PROMPT_KEY)) {
		return;
	}

	await context.globalState.update(INSTALL_PROMPT_KEY, true);
	const open = { title: 'Open' };
	const close = { title: 'Close', isCloseAffordance: true };
	const choice = await vscode.window.showInformationMessage(
		'aicount is installed. Open the full project report?',
		{ modal: true, detail: 'You can also open it later from the aicount icon in the Activity Bar.' },
		open,
		close,
	);
	if (choice === open) {
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
	statisticsPanel.onDidDispose(() => statisticsPanel = undefined, null, context.subscriptions);
	statisticsPanel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
		if (message.type === 'refresh') {
			await renderStatistics(statisticsPanel!);
		}
	});
	await renderStatistics(statisticsPanel);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "poc" is now active!');

	const sidebarProvider = new StatisticsSidebarProvider();
	const disposable = vscode.commands.registerCommand('poc.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from poc!');
	});
	const statisticsCommand = vscode.commands.registerCommand('poc.projectStatistics', () => showStatisticsPanel(context));
	const refreshCommand = vscode.commands.registerCommand('poc.refreshSidebar', () => sidebarProvider.refresh());

	context.subscriptions.push(
		disposable,
		statisticsCommand,
		refreshCommand,
		vscode.window.registerWebviewViewProvider(StatisticsSidebarProvider.viewType, sidebarProvider),
	);

	void showInstallPrompt(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
