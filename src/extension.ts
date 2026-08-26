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
let statisticsRefresh: Promise<void> | undefined;
let statisticsRefreshAgain = false;
let statisticsPanelReady = false;

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
	'.mobileprovision', '.xcconfig', '.pubxml', '.publishsettings',
	'.tfvars', '.tfstate', '.netrc',
]);

const TRANSLATION_BUNDLE_PREFIXES = new Set([
	'messages',
	'labels',
	'i18n',
	'text',
	'texts',
	'strings',
	'errors',
	'validationmessages',
	'bundle',
]);

const SECRET_FILENAMES = new Set([
	'.env', '.netrc', '.npmrc', '.pypirc', '.yarnrc', '.htpasswd', '.pgpass', '.my.cnf',
	'.s3cfg', '.boto', '.dockercfg', '.git-credentials', '.aws-credentials',
	'kubeconfig', 'known_hosts', 'parameters.yml', 'parameters.yaml',
	'google-services.json', 'googleservice-info.plist',
	'htpasswd', 'htdigest',
]);

const SECRET_FILENAME_PATTERNS = [
	/^\.env(\.|$)/,
	/^\.yarnrc(\.|$)/,
	/^id_[a-z0-9]+$/,
	/^appsettings(?:[._-][a-z0-9._-]*)?\.json$/,
	/^service[._-]?account[a-z0-9._-]*\.json$/,
	/^wp-config(?:[._-][a-z0-9._-]*)?\.php$/,
	/^(dbconfig|databaseconfig|firebaseconfig)([._-]|$)/,
	/^(?:[a-z0-9]+_)?(?:settings|config)\.py$/,
	/\.tfvars\.json$/,
	/\.tfstate\.backup$/,
];

const SECRET_WORDS = /(^|[._-])(secret|secrets|credential|credentials|apikey|api_key|api_keys|api-key|api-keys|passwd)([._-]|$)/;
const TYPE_DECLARATION = /\.(model|models|dto|interface|interfaces|type|types|enum|enums|schema)\.(ts|tsx|js|jsx)$/;
const CONFIG_SECRET_WORDS = /(^|[._-])(config|configuration|settings|password|passwords|private|vault|auth|token)([._-]|$)/;
const CREDENTIAL_DIRECTORIES = /(^|\/)(\.ssh|\.aws|\.gnupg|\.kube|\.docker|\.m2|\.cargo|secret|secrets|credential|credentials|creds|vault|certs|certificates|keys)(\/|$)/;
const CONFIG_DIRECTORIES = /(^|\/)(config|configs|conf|configuration|settings|helm|charts)(\/|$)/;

export function isSensitiveFile(filePath: string): boolean {
	const path = normalizePath(filePath);
	const name = fileNameOf(path);
	const extension = extensionOf(name);

	if (SECRET_FILENAMES.has(name)
		|| (SECRET_EXTENSIONS.has(extension) && !isTranslationBundle(name))
		|| (SECRET_WORDS.test(name) && !TYPE_DECLARATION.test(name))
		|| SECRET_FILENAME_PATTERNS.some((pattern) => pattern.test(name))) {
		return true;
	}

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

const PRIVATE_KEY_BLOCK = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/;
const OPENSSH_PRIVATE_KEY = /-----BEGIN OPENSSH PRIVATE KEY-----/;
const PGP_PRIVATE_KEY = /-----BEGIN PGP PRIVATE KEY BLOCK-----/;
const HTPASSWD_HASH = /(?:^|\n)[^:\s\n]+:\$(?:apr1|2[aby]|6|5|1)\$/;
const HTPASSWD_SHA = /(?:^|\n)[^:\s\n]+:\{S?SHA\}/;
const PHP_DEFINE = /define\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_]+)['"]\s*,\s*['"]([^'"]+)['"]/g;

function parseNetrcPasswordValue(line: string): string | undefined {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('#')) {
		return undefined;
	}

	const keyword = 'password';
	if (trimmed.length <= keyword.length || trimmed.slice(0, keyword.length).toLowerCase() !== keyword) {
		return undefined;
	}

	let cursor = keyword.length;
	while (cursor < trimmed.length && (trimmed[cursor] === ' ' || trimmed[cursor] === '\t')) {
		cursor += 1;
	}
	if (cursor >= trimmed.length) {
		return undefined;
	}

	let value = '';
	for (let index = cursor; index < trimmed.length; index++) {
		const char = trimmed[index];
		if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
			break;
		}
		value += char;
	}

	return value || undefined;
}

function extractNetrcPassword(content: string): string | undefined {
	for (const rawLine of content.split(/\r\n|\r|\n/)) {
		const value = parseNetrcPasswordValue(rawLine);
		if (value !== undefined && !isInertValue(value)) {
			return value;
		}
	}
	return undefined;
}

function extractAssignmentPair(line: string): { key: string; value: string } | undefined {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('*')) {
		return undefined;
	}

	let separatorIndex = -1;
	for (let index = 0; index < trimmed.length; index++) {
		const char = trimmed[index];
		if (char === '=' || char === ':') {
			separatorIndex = index;
			break;
		}
	}
	if (separatorIndex <= 0) {
		return undefined;
	}

	const keyPart = trimmed.slice(0, separatorIndex).trim();
	const keyStart = Math.max(keyPart.lastIndexOf(' '), keyPart.lastIndexOf('\t')) + 1;
	const key = keyPart.slice(keyStart).replace(/^['"]|['"]$/g, '');
	const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
	if (!key || !value) {
		return undefined;
	}

	return { key, value };
}

function normalizeSecretKey(key: string): string {
	return key
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[-./]/g, '_')
		.toLowerCase();
}

function isTwoPartLocaleSuffix(value: string): boolean {
	if (value.length !== 2 && value.length !== 5) {
		return false;
	}

	for (let index = 0; index < value.length; index++) {
		const char = value.charCodeAt(index);
		if (index === 2) {
			if (char !== 95) {
				return false;
			}
			continue;
		}
		const isLetter = char >= 97 && char <= 122;
		if (!isLetter) {
			return false;
		}
	}

	return true;
}

function isTranslationBundle(name: string): boolean {
	if (!name.endsWith('.properties')) {
		return false;
	}

	const stem = name.slice(0, -'.properties'.length);
	for (const prefix of TRANSLATION_BUNDLE_PREFIXES) {
		if (stem === prefix) {
			return true;
		}
		if (stem.startsWith(`${prefix}.`) || stem.startsWith(`${prefix}_`) || stem.startsWith(`${prefix}-`)) {
			return true;
		}
	}

	const localeSeparator = Math.max(stem.lastIndexOf('_'), stem.lastIndexOf('-'));
	if (localeSeparator === -1) {
		return false;
	}

	return isTwoPartLocaleSuffix(stem.slice(localeSeparator + 1));
}

export function isSecretKeyName(key: string): boolean {
	const normalized = normalizeSecretKey(key);
	if (!normalized) {
		return false;
	}

	const compact = normalized.replace(/_/g, '');

	if (/(?:^|_)(?:password|passwd|pwd|pw|secret|secrets|token|tokens|credential|credentials|api_key|apikey|access_key|private_key|secret_key|auth_token|access_token|client_secret|client_key_data|connection_string|database_url|db_password|db_url|master_key|auth_key|signing_key|pat|sk)(?:s|_value|_data)?$/.test(normalized)) {
		return true;
	}
	if (/^(?:password|passwd|pwd|pw|secret|secrets|token|tokens|credentials?|api_keys?|pat|sk)$/.test(normalized)) {
		return true;
	}
	if (/_auth_?token$/.test(normalized)) {
		return true;
	}
	if (normalized.includes('private_key')
		|| normalized.includes('client_secret')
		|| normalized.includes('secret_key')
		|| normalized.includes('access_key')
		|| normalized.includes('signing_key')) {
		return true;
	}

	return /(?:api|access|auth|private|secret|client|master|signing)keys?$/.test(compact)
		|| /(?:access|auth|id|refresh|session|api)tokens?$/.test(compact)
		|| /(?:client|api|app)secrets?$/.test(compact);
}

function isInertValue(value: string): boolean {
	let trimmed = value.trim().replace(/^['"`]|['"`]$/g, '').trim();
	while (trimmed.endsWith(',') || trimmed.endsWith(';')) {
		trimmed = trimmed.slice(0, -1).trimEnd();
	}
	if (trimmed.length < 3) {
		return true;
	}

	return /^\$\{|^\$\(|^\{\{|^<%|^<[^>]+>$/.test(trimmed)
		|| /^(true|false|null|none|undefined|nil|string|number|boolean|any|object|bool|int|integer|float|str|bytes|changeme|placeholder|example|todo|xxx+|your[_-].+)$/i.test(trimmed)
		|| /^(process\.env|os\.environ|system\.getenv)\b/i.test(trimmed);
}

export function valueHoldsEmbeddedCredential(value: string): boolean {
	const trimmed = value.trim().replace(/^['"`]|['"`]$/g, '');
	const schemeSeparator = trimmed.indexOf('://');
	if (schemeSeparator <= 0) {
		return false;
	}

	const scheme = trimmed.slice(0, schemeSeparator);
	if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
		return false;
	}

	const authority = trimmed.slice(schemeSeparator + 3);
	const atIndex = authority.indexOf('@');
	if (atIndex <= 0) {
		return false;
	}

	const credentials = authority.slice(0, atIndex);
	const colonIndex = credentials.indexOf(':');
	if (colonIndex <= 0) {
		return false;
	}

	const user = credentials.slice(0, colonIndex);
	const password = credentials.slice(colonIndex + 1);
	if (!user || !password || /[\s/@:]/.test(user) || /[\s@]/.test(password)) {
		return false;
	}

	return !isInertValue(password);
}

function pairLooksSensitive(key: string, value: string): boolean {
	if (isInertValue(value)) {
		return false;
	}

	return isSecretKeyName(key) || valueHoldsEmbeddedCredential(value);
}

function hasNonInertString(value: unknown, depth = 0): boolean {
	if (depth > 12 || value === null || value === undefined) {
		return false;
	}
	if (typeof value === 'string') {
		return !isInertValue(value);
	}
	if (typeof value !== 'object') {
		return false;
	}
	if (Array.isArray(value)) {
		return value.some((item) => hasNonInertString(item, depth + 1));
	}

	return Object.values(value).some((item) => hasNonInertString(item, depth + 1));
}

function jsonHoldsSecrets(content: string): boolean {
	const trimmed = content.trim();
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
		return false;
	}

	try {
		return jsonValueHoldsSecrets(JSON.parse(trimmed));
	} catch {
		return false;
	}
}

function jsonObjectHoldsSecrets(value: object): boolean {
	for (const [key, child] of Object.entries(value)) {
		if (typeof child === 'string' && pairLooksSensitive(key, child)) {
			return true;
		}
		if (isSecretKeyName(key) && hasNonInertString(child)) {
			return true;
		}
		if (jsonValueHoldsSecrets(child)) {
			return true;
		}
	}
	return false;
}

function jsonValueHoldsSecrets(value: unknown): boolean {
	if (typeof value === 'string') {
		return valueHoldsEmbeddedCredential(value);
	}
	if (Array.isArray(value)) {
		return value.some(jsonValueHoldsSecrets);
	}
	if (value && typeof value === 'object') {
		return jsonObjectHoldsSecrets(value);
	}
	return false;
}

function assignmentsHoldSecrets(content: string): boolean {
	PHP_DEFINE.lastIndex = 0;
	for (const match of content.matchAll(PHP_DEFINE)) {
		if (pairLooksSensitive(match[1], match[2])) {
			return true;
		}
	}

	if (extractNetrcPassword(content)) {
		return true;
	}

	for (const rawLine of content.split(/\r\n|\r|\n/)) {
		const pair = extractAssignmentPair(rawLine);
		if (pair && pairLooksSensitive(pair.key, pair.value)) {
			return true;
		}
	}

	return false;
}

export function isSensitiveContent(content: string): boolean {
	return explainSensitiveContent(content) !== undefined;
}

export type SensitiveContentCheck =
	| 'PRIVATE_KEY_BLOCK'
	| 'HTPASSWD'
	| 'jsonHoldsSecrets'
	| 'assignmentsHoldSecrets'
	| 'connection-string';

export function explainSensitiveContent(content: string): { check: SensitiveContentCheck; line?: string } | undefined {
	if (!content) {
		return undefined;
	}

	if (PRIVATE_KEY_BLOCK.test(content) || OPENSSH_PRIVATE_KEY.test(content) || PGP_PRIVATE_KEY.test(content)) {
		return { check: 'PRIVATE_KEY_BLOCK' };
	}
	if (HTPASSWD_HASH.test(content) || HTPASSWD_SHA.test(content)) {
		return { check: 'HTPASSWD' };
	}
	if (jsonHoldsSecrets(content)) {
		return { check: 'jsonHoldsSecrets' };
	}

	for (const rawLine of content.split(/\r\n|\r|\n/)) {
		const pair = extractAssignmentPair(rawLine);
		if (!pair || !pairLooksSensitive(pair.key, pair.value)) {
			continue;
		}
		const line = rawLine.trim();
		if (valueHoldsEmbeddedCredential(pair.value)) {
			return { check: 'connection-string', line };
		}
		return { check: 'assignmentsHoldSecrets', line };
	}

	if (assignmentsHoldSecrets(content)) {
		return { check: 'assignmentsHoldSecrets' };
	}

	return undefined;
}

export function explainFileExclusion(relativePath: string, content: string): {
	skipped: boolean;
	by?: 'generated' | 'env-filename' | 'sensitive-filename' | 'binary' | 'sensitive-content';
	detail?: { check: SensitiveContentCheck; line?: string };
} {
	if (isGeneratedFile(relativePath)) {
		return { skipped: true, by: 'generated' };
	}
	if (isDotfileOrEnvFile(relativePath)) {
		return { skipped: true, by: 'env-filename' };
	}
	if (isSensitiveFile(relativePath)) {
		return { skipped: true, by: 'sensitive-filename' };
	}
	if (looksBinary(new TextEncoder().encode(content))) {
		return { skipped: true, by: 'binary' };
	}
	const detail = explainSensitiveContent(content);
	if (detail) {
		return { skipped: true, by: 'sensitive-content', detail };
	}
	return { skipped: false };
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

export const NO_EXTENSION_BUCKET = 'No extension';

const WELL_KNOWN_EXTENSIONLESS_SOURCES = new Set([
	'dockerfile',
	'makefile',
	'rakefile',
	'jenkinsfile',
	'vagrantfile',
	'procfile',
]);

export function isWellKnownExtensionlessSource(fileName: string): boolean {
	return WELL_KNOWN_EXTENSIONLESS_SOURCES.has(fileName.toLowerCase());
}

export function fileExtensionBucket(fileName: string): string {
	if (fileName.includes('.') && !fileName.startsWith('.')) {
		return `.${fileName.split('.').pop()?.toLowerCase()}`;
	}
	return NO_EXTENSION_BUCKET;
}

export function isDotfileOrEnvFile(filePath: string): boolean {
	const name = fileNameOf(normalizePath(filePath));
	return name === 'env'
		|| name === '.env'
		|| name.startsWith('.env.')
		|| name.endsWith('.env')
		|| name.includes('.env.');
}

export function shouldIncludeScannedFile(relativePath: string, content: string): boolean {
	if (isGeneratedFile(relativePath) || isDotfileOrEnvFile(relativePath) || isSensitiveFile(relativePath)) {
		return false;
	}
	if (looksBinary(new TextEncoder().encode(content))) {
		return false;
	}
	return !isSensitiveContent(content);
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
		if (isGeneratedFile(relativePath) || isDotfileOrEnvFile(relativePath) || isSensitiveFile(relativePath)) {
			continue;
		}

		const extension = fileExtensionBucket(name);

		try {
			const editorText = openEditorText(uri);
			const text = editorText ?? await readDiskText(uri);
			if (text === undefined) {
				continue;
			}
			if (isSensitiveContent(text)) {
				continue;
			}

			files.push({
				name,
				directory,
				extension,
				area: classifyFile(relativePath, extension),
				lines: countLines(text),
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

function openEditorText(uri: vscode.Uri): string | undefined {
	const wanted = normalizePath(uri.fsPath);
	if (!wanted) {
		return undefined;
	}

	for (const document of vscode.workspace.textDocuments) {
		if (document.uri.scheme !== uri.scheme) {
			continue;
		}
		if (normalizePath(document.uri.fsPath) === wanted) {
			return document.getText();
		}
	}

	return undefined;
}

async function readDiskText(uri: vscode.Uri): Promise<string | undefined> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	if (looksBinary(bytes)) {
		return undefined;
	}

	return new TextDecoder().decode(bytes);
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

export function sanitizeCsvProjectName(name: string): string {
	let cleaned = name
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
		.replace(/\s+/g, '_')
		.replace(/_+/g, '_');
	while (cleaned.startsWith('_')) {
		cleaned = cleaned.slice(1);
	}
	while (cleaned.endsWith('_')) {
		cleaned = cleaned.slice(0, -1);
	}
	return cleaned || 'Project';
}

export function buildCsvDownloadFileName(projectName: string, now = new Date()): string {
	const pad2 = (value: number) => String(value).padStart(2, '0');
	const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
	const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
	return `${sanitizeCsvProjectName(projectName)}_AIStudioFileStats_${date}_${time}.csv`;
}

export function buildProjectStatsCsv(stats: ProjectStats): string {
	const rows = [
		`Total Files,${stats.files.length}`,
		`Total Lines,${stats.totalLines}`,
		'',
		'Name,Extension,No. of lines',
	];
	for (const file of stats.files) {
		rows.push(`${escapeCsvCell(file.name)},${escapeCsvCell(file.extension)},${file.lines}`);
	}
	return rows.join('\r\n');
}
async function refreshProjectStatistics(showProgress: boolean): Promise<void> {
	if (statisticsRefresh) {
		statisticsRefreshAgain = true;
		return statisticsRefresh;
	}

	statisticsRefresh = (async () => {
		try {
			do {
				statisticsRefreshAgain = false;
				if (!vscode.workspace.workspaceFolders?.length) {
					statisticsSidebar?.renderSummary();
					if (statisticsPanelReady && statisticsPanel) {
						void statisticsPanel.webview.postMessage({ type: 'statsError' });
					}
					return;
				}

				const stats = showProgress
					? await vscode.window.withProgress(
						{ location: vscode.ProgressLocation.Notification, title: 'Analyzing project statistics...' },
						() => collectProjectStats(),
					)
					: await collectProjectStats();
				if (statisticsPanel) {
					setStatisticsPanelHtml(statisticsPanel, stats);
				}
				statisticsSidebar?.renderSummary(stats);
			} while (statisticsRefreshAgain);
		} catch {
			if (statisticsPanelReady && statisticsPanel) {
				void statisticsPanel.webview.postMessage({ type: 'statsError' });
			}
		}
	})().finally(() => {
		statisticsRefresh = undefined;
	});

	return statisticsRefresh;
}

function fileRowsHtml(stats: ProjectStats): string {
	return stats.files
		.map((file) => `<tr class="file-row" data-name="${escapeHtml(file.name.toLowerCase())}" data-path="${escapeHtml(fileDisplayPath(file).toLowerCase())}" data-extension="${escapeHtml(file.extension.toLowerCase())}" data-lines="${file.lines}"><td class="sno"></td><td class="file-name">${escapeHtml(file.name)}</td><td class="extension">${escapeHtml(file.extension)}</td><td class="lines">${formatCount(file.lines)}</td></tr>`)
		.join('');
}

function filesSectionHtml(stats: ProjectStats): string {
	const rowsHtml = fileRowsHtml(stats);
	return rowsHtml
		? `<div class="table-wrap"><table class="file-table"><thead><tr><th>S.No</th><th>Name</th><th>Extension</th><th>No. of lines</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`
		: '<p class="empty">No files found.</p>';
}

function setStatisticsPanelHtml(panel: vscode.WebviewPanel, stats: ProjectStats): void {
	const csvContent = buildProjectStatsCsv(stats);
	const filesHtml = filesSectionHtml(stats);
	const payload = {
		type: 'stats' as const,
		totalFilesLabel: formatCount(stats.files.length),
		totalLinesLabel: formatCount(stats.totalLines),
		filesHtml,
		csvContent,
	};

	if (statisticsPanelReady) {
		void panel.webview.postMessage(payload);
		return;
	}

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
.file-table .extension { color: var(--vscode-descriptionForeground); white-space: nowrap; width: 140px; }
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
	<div class="metric"><span class="metric-icon"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 3h7l4 4v10a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 3.5 17V4.5A1.5 1.5 0 0 1 5 3z" stroke="currentColor"/><path d="M12 3v4h4" stroke="currentColor"/></svg></span><div><strong id="total-files">${formatCount(stats.files.length)}</strong><span>Total files</span></div></div>
	<div class="metric"><span class="metric-icon"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 5L4 10l4 5M12 5l4 5-4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><strong id="total-lines">${formatCount(stats.totalLines)}</strong><span>Total lines</span></div></div>
</div>
<div class="files-header">
	<h2>Files</h2>
	<div class="files-toolbar">
		<label>Sort by: <select id="sort-by" aria-label="Sort files"><option value="name">Name</option><option value="extension">Extension</option><option value="lines">No. of lines</option></select></label>
		<button id="download-csv" class="ghost-button" type="button"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v7M5.5 7.5L8 10l2.5-2.5M3.5 13h9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>Export</button>
	</div>
</div>
<div id="files-section">${filesHtml}</div>
</main>
<script>
const vscode = acquireVsCodeApi();
const search = document.getElementById('search');
const sortBy = document.getElementById('sort-by');
const refresh = document.getElementById('refresh');
let csvContent = ${JSON.stringify(csvContent)};
const csvProjectName = ${JSON.stringify(sanitizeCsvProjectName(vscode.workspace.name ?? 'Project'))};
function pad2(value) {
	return String(value).padStart(2, '0');
}
function csvDownloadFileName() {
	const now = new Date();
	const date = String(now.getFullYear()) + pad2(now.getMonth() + 1) + pad2(now.getDate());
	const time = pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds());
	return csvProjectName + '_AIStudioFileStats_' + date + '_' + time + '.csv';
}
function matchScore(row, query) {
	const name = row.dataset.name || '';
	const extension = row.dataset.extension || '';
	if (!query) return 4;
	if (name === query || extension === query) return 0;
	if (name.startsWith(query) || extension.startsWith(query)) return 1;
	if (name.includes(query) || extension.includes(query)) return 2;
	return 99;
}
function fileRows() {
	return [...document.querySelectorAll('.file-table tbody tr.file-row')];
}
function renumberRows() {
	let serial = 1;
	fileRows().forEach((row) => {
		if (row.hidden) return;
		row.querySelector('.sno').textContent = String(serial++);
	});
}
function filterFiles() {
	const query = search.value.trim().toLowerCase();
	const rows = fileRows();
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
	const rows = fileRows();
	rows.sort((first, second) => {
		if (mode === 'lines') return Number(second.dataset.lines) - Number(first.dataset.lines);
		if (mode === 'extension') {
			return (first.dataset.extension || '').localeCompare(second.dataset.extension || '') || (first.dataset.name || '').localeCompare(second.dataset.name || '');
		}
		return (first.dataset.name || '').localeCompare(second.dataset.name || '');
	});
	rows.forEach((row) => row.parentElement.appendChild(row));
	renumberRows();
}
function applyStats(payload) {
	document.getElementById('total-files').textContent = payload.totalFilesLabel;
	document.getElementById('total-lines').textContent = payload.totalLinesLabel;
	document.getElementById('files-section').innerHTML = payload.filesHtml;
	csvContent = payload.csvContent;
	refresh.disabled = false;
	if (search.value.trim()) {
		filterFiles();
		return;
	}
	sortRows();
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
refresh.addEventListener('click', (event) => {
	event.currentTarget.disabled = true;
	vscode.postMessage({ type: 'refresh' });
});
window.addEventListener('message', (event) => {
	if (!event.data) {
		return;
	}
	if (event.data.type === 'stats') {
		applyStats(event.data);
		return;
	}
	if (event.data.type === 'statsError') {
		refresh.disabled = false;
	}
});
document.getElementById('download-csv').addEventListener('click', () => {
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = csvDownloadFileName();
	link.click();
	URL.revokeObjectURL(url);
});
</script>
</body>
</html>`;
	statisticsPanelReady = true;
}

class StatisticsSidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'aicount.sidebar';
	private view?: vscode.WebviewView;
	private resolved = false;

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		webviewView.webview.onDidReceiveMessage((message: { type?: string }) => {
			if (message.type === 'openReport') {
				void vscode.commands.executeCommand('poc.projectStatistics');
			}
		});
		webviewView.onDidDispose(() => {
			this.resolved = false;
			this.view = undefined;
		});
		void this.refresh();
	}

	clear(): void {
		this.resolved = false;
		if (this.view) {
			this.view.webview.html = '';
			this.view = undefined;
		}
	}

	renderSummary(stats?: ProjectStats): void {
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

		if (!stats) {
			return;
		}

		this.view.webview.html = renderSidebarHtml({
			hasWorkspace: true,
			totalFiles: stats.files.length,
			totalLines: stats.totalLines,
		});
	}

	async refresh(): Promise<void> {
		await refreshProjectStatistics(false);
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
		await refreshProjectStatistics(true);
		return;
	}

	statisticsPanel = vscode.window.createWebviewPanel(
		'poc.projectStatistics',
		'Project Statistics',
		vscode.ViewColumn.Active,
		{ enableScripts: true },
	);
	statisticsPanel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
		if (message.type !== 'refresh') {
			return;
		}

		await refreshProjectStatistics(true);
	});
	statisticsPanel.onDidDispose(() => {
		statisticsPanel = undefined;
		statisticsPanelReady = false;
	}, null, context.subscriptions);
	await refreshProjectStatistics(true);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "poc" is now active!');
	void vscode.commands.executeCommand('setContext', 'aicount.enabled', true);

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
		{ dispose: shutdownAicountUi },
	);

	void showInstallPrompt(context);
}

function shutdownAicountUi(): void {
	void vscode.commands.executeCommand('setContext', 'aicount.enabled', false);
	void vscode.commands.executeCommand('workbench.view.explorer');
	statisticsRefresh = undefined;
	statisticsPanelReady = false;
	if (statisticsPanel) {
		statisticsPanel.dispose();
		statisticsPanel = undefined;
	}
	statisticsSidebar?.clear();
	statisticsSidebar = undefined;
}

export function deactivate() {
	shutdownAicountUi();
}
