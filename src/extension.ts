// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import ExcelJS from 'exceljs';

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
let latestProjectStats: ProjectStats | undefined;

export function isSensitiveFile(filePath: string): boolean {
	const lowerCasePath = filePath.toLowerCase().replaceAll('\\', '/');
	const lowerCaseName = lowerCasePath.split('/').pop() ?? lowerCasePath;
	const sensitiveName = /(^|[._-])(config|configuration|secret|secrets|credential|credentials|password|passwd|apikey|api-key|api-keys)([._-]|$)/;
	const sensitiveDirectory = /(^|\/)(config|configs|conf|configuration|settings|secrets|secret|vault|credentials|creds|credential|private|certificates|certs|keys|key|target|build|\.gradle|\.idea|\.ssh|\.aws|\.kube|vendor)(\/|$)/;
	return lowerCaseName === '.dockerignore'
		|| lowerCaseName === '.env'
		|| lowerCaseName.endsWith('.env')
		|| lowerCaseName.startsWith('.env.')
		|| lowerCaseName === '.gitignore'
		|| lowerCaseName === '.npmrc'
		|| lowerCaseName === '.pypirc'
		|| lowerCaseName === '.yarnrc'
		|| lowerCaseName === '.netrc'
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
		|| lowerCaseName === 'id_dsa'
		|| lowerCaseName === 'id_ed25519'
		|| lowerCaseName === 'known_hosts'
		|| lowerCaseName.endsWith('.pem')
		|| lowerCaseName.endsWith('.key')
		|| lowerCaseName.endsWith('.ppk')
		|| lowerCaseName.endsWith('.p12')
		|| lowerCaseName.endsWith('.pfx')
		|| lowerCaseName.endsWith('.crt')
		|| lowerCaseName.endsWith('.cer')
		|| lowerCaseName.endsWith('.der')
		|| lowerCaseName.endsWith('.jks')
		|| lowerCaseName.endsWith('.keystore')
		|| lowerCaseName.endsWith('.truststore')
		|| lowerCaseName.endsWith('.tfvars')
		|| lowerCaseName.endsWith('.class')
		|| lowerCaseName.endsWith('.pdf')
		|| lowerCaseName.endsWith('.sqlite')
		|| lowerCaseName.endsWith('.sqlite3')
		|| lowerCaseName.endsWith('.db')
		|| lowerCaseName.endsWith('.dump')
		|| lowerCaseName.endsWith('.bak')
		|| lowerCaseName.endsWith('.old')
		|| lowerCaseName.endsWith('.tfstate')
		|| lowerCaseName.endsWith('.tfstate.backup')
		|| lowerCaseName.endsWith('.kdbx')
		|| lowerCasePath.includes('/.aws/credentials')
		|| lowerCasePath.includes('/.aws/config')
		|| lowerCasePath.includes('/.kube/config')
		|| lowerCasePath.includes('/.docker/config.json')
		|| /^(dbconfig|databaseconfig|firebaseconfig)([-_.]|$)/.test(lowerCaseName)
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

function escapeCsvCell(value: string): string {
	const escaped = value.replace(/"/g, '""');
	return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat('en-US').format(value);
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
	rows.push('PROJECT STATISTICS');
	rows.push('Project,Project Name');
	rows.push(`Total Files,${stats.files.length}`);
	rows.push(`Total Lines,${stats.totalLines}`);
	rows.push('');
	rows.push('FILE TYPE,FILE,LINES');

	for (const group of groupProjectFiles(stats)) {
		for (const file of group.files) {
			rows.push(`${escapeCsvCell(group.extension)},${escapeCsvCell(file.name)},${file.lines}`);
		}
	}

	return rows.join('\r\n');
}

export function generateProjectStatsWorkbook(stats: ProjectStats): ExcelJS.Workbook {
	const workbook = new ExcelJS.Workbook();
	const projectName = vscode.workspace.name ?? 'Project';
	const groups = groupProjectFiles(stats);
	const fileTypeCount = new Set(stats.files.map((file) => file.extension)).size;
	const worksheet = workbook.addWorksheet('Project Statistics');

	worksheet.mergeCells('A1:D1');
	worksheet.getCell('A1').value = 'PROJECT STATISTICS REPORT';
	worksheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF1F1F1F' } };
	worksheet.getCell('A1').alignment = { horizontal: 'center' };
	worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };

	worksheet.addRow([]);
	worksheet.addRow(['Project Name', projectName]);
	worksheet.addRow(['Total Files', formatNumber(stats.files.length)]);
	worksheet.addRow(['Total Lines', formatNumber(stats.totalLines)]);
	worksheet.addRow(['File Types', formatNumber(fileTypeCount)]);
	worksheet.addRow([]);
	worksheet.addRow(['FILE TYPE SUMMARY']);
	worksheet.addRow(['File Type', 'Number of Files', 'Total Lines']);

	for (const group of groups) {
		worksheet.addRow([group.extension, group.files.length, formatNumber(group.totalLines)]);
	}

	worksheet.addRow([]);
	worksheet.addRow(['DETAILED FILE BREAKDOWN']);

	for (const group of groups) {
		worksheet.addRow([`${group.extension} — ${group.files.length} file${group.files.length === 1 ? '' : 's'} / ${formatNumber(group.totalLines)} lines`]);
		worksheet.addRow(['File', 'Lines']);
		for (const file of group.files) {
			worksheet.addRow([file.name, file.lines]);
		}
		worksheet.addRow([]);
	}

	const sectionHeaderRows = new Set<number>();
	for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex++) {
		const row = worksheet.getRow(rowIndex);
		for (let colIndex = 1; colIndex <= 3; colIndex++) {
			const cell = row.getCell(colIndex);
			if (cell.value === null || cell.value === undefined || cell.value === '') {
				continue;
			}
			if (rowIndex === 1 || rowIndex === 7 || rowIndex === 11 || rowIndex === 13) {
				cell.font = { bold: true, size: 12 };
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
				sectionHeaderRows.add(rowIndex);
			}
			if (rowIndex >= 8 && rowIndex <= 10) {
				cell.font = { bold: true };
			}
			if (typeof cell.value === 'number' && colIndex === 2) {
				cell.numFmt = '#,##0';
				cell.alignment = { horizontal: 'right' };
			}
			if (typeof cell.value === 'number' && colIndex === 3) {
				cell.numFmt = '#,##0';
				cell.alignment = { horizontal: 'right' };
			}
		}
	}

	worksheet.columns = [
		{ key: 'A', width: 28 },
		{ key: 'B', width: 22 },
		{ key: 'C', width: 18 },
		{ key: 'D', width: 18 },
	];
	worksheet.getColumn(2).alignment = { horizontal: 'left' };
	worksheet.getColumn(3).alignment = { horizontal: 'right' };
	worksheet.getColumn(4).alignment = { horizontal: 'right' };

	for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex++) {
		const row = worksheet.getRow(rowIndex);
		row.eachCell((cell) => {
			cell.border = {
				top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
				right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
				bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
				left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
			};
		});
	}

	return workbook;
}

export async function generateProjectStatsWorkbookV2(stats: ProjectStats): Promise<ExcelJS.Workbook> {
	const workbook = new ExcelJS.Workbook();
	const groups = groupProjectFiles(stats);
	const fileTypeCount = new Set(stats.files.map((file) => file.extension)).size;
	const projectName = vscode.workspace.name ?? 'Project';
	const sheet = workbook.addWorksheet('Project Statistics', {
		views: [{ state: 'frozen', ySplit: 7 }],
	});

	workbook.creator = 'Project Statistics';
	workbook.created = new Date();
	workbook.modified = new Date();
	sheet.properties.defaultRowHeight = 20;
	sheet.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

	const border = (color: string) => ({
		top: { style: 'thin' as const, color: { argb: color } },
		left: { style: 'thin' as const, color: { argb: color } },
		right: { style: 'thin' as const, color: { argb: color } },
		bottom: { style: 'thin' as const, color: { argb: color } },
	});

	const titleRow = sheet.addRow(['PROJECT STATISTICS REPORT']);
	sheet.mergeCells(titleRow.number, 1, titleRow.number, 3);
	titleRow.height = 26;
	titleRow.getCell(1).font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
	titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
	titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
	titleRow.getCell(1).border = border('FF1D4ED8');

	const projectRow = sheet.addRow(['Project Name', projectName]);
	sheet.mergeCells(projectRow.number, 2, projectRow.number, 3);
	projectRow.getCell(1).font = { bold: true, color: { argb: 'FF475569' } };
	projectRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
	projectRow.getCell(1).border = border('FFE2E8F0');
	projectRow.getCell(2).font = { bold: true, color: { argb: 'FF0F172A' }, size: 12 };
	projectRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
	projectRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
	projectRow.getCell(2).border = border('FFE2E8F0');
	projectRow.getCell(3).font = { bold: true, color: { argb: 'FF0F172A' }, size: 12 };
	projectRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
	projectRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
	projectRow.getCell(3).border = border('FFE2E8F0');

	sheet.addRow([]);

	const summaryTitle = sheet.addRow(['SUMMARY']);
	sheet.mergeCells(summaryTitle.number, 1, summaryTitle.number, 3);
	summaryTitle.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
	summaryTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
	summaryTitle.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
	summaryTitle.getCell(1).border = border('FFCBD5E1');

	for (const [label, value] of [
		['Total Files', stats.files.length],
		['Total Lines', stats.totalLines],
		['File Types', fileTypeCount],
	] as Array<[string, number]>) {
		const row = sheet.addRow([label, value]);
		row.getCell(1).font = { bold: true, color: { argb: 'FF475569' } };
		row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
		row.getCell(1).border = border('FFE2E8F0');
		row.getCell(2).font = { bold: true, color: { argb: 'FF0F172A' }, size: 12 };
		row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
		row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
		row.getCell(2).border = border('FFE2E8F0');
		row.getCell(2).numFmt = '#,##0';
	}

	sheet.addRow([]);

	const fileTypeSummaryTitle = sheet.addRow(['FILE TYPE SUMMARY']);
	sheet.mergeCells(fileTypeSummaryTitle.number, 1, fileTypeSummaryTitle.number, 3);
	fileTypeSummaryTitle.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
	fileTypeSummaryTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
	fileTypeSummaryTitle.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
	fileTypeSummaryTitle.getCell(1).border = border('FFCBD5E1');

	const fileTypeHeader = sheet.addRow(['File Type', 'Number of Files', 'Total Lines']);
	fileTypeHeader.eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
		cell.alignment = { vertical: 'middle', horizontal: 'left' };
		cell.border = border('FF94A3B8');
	});

	for (const [index, group] of groups.entries()) {
		const row = sheet.addRow([getWorkbookExtensionLabel(group.extension), group.files.length, group.totalLines]);
		row.getCell(2).numFmt = '#,##0';
		row.getCell(3).numFmt = '#,##0';
		row.eachCell((cell, columnNumber) => {
			cell.alignment = { vertical: 'middle', horizontal: columnNumber > 1 ? 'right' : 'left' };
			cell.border = border('FFE2E8F0');
			if (index % 2 === 1) {
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
			}
		});
	}

	sheet.addRow([]);

	const detailTitle = sheet.addRow(['DETAILED FILE BREAKDOWN']);
	sheet.mergeCells(detailTitle.number, 1, detailTitle.number, 3);
	detailTitle.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
	detailTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
	detailTitle.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
	detailTitle.getCell(1).border = border('FFCBD5E1');

	for (const group of groups) {
		const heading = sheet.addRow([`${getWorkbookExtensionLabel(group.extension)} FILES — ${group.files.length} FILE${group.files.length === 1 ? '' : 'S'}`]);
		sheet.mergeCells(heading.number, 1, heading.number, 3);
		heading.getCell(1).font = { bold: true, color: { argb: 'FF0F172A' }, size: 11 };
		heading.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
		heading.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
		heading.getCell(1).border = border('FFCBD5E1');

		const header = sheet.addRow(['File', 'Lines']);
		header.eachCell((cell) => {
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
			cell.alignment = { vertical: 'middle', horizontal: 'left' };
			cell.border = border('FF94A3B8');
		});

		for (const [index, file] of group.files.entries()) {
			const row = sheet.addRow([file.name, file.lines]);
			row.getCell(2).numFmt = '#,##0';
			row.eachCell((cell, columnNumber) => {
				cell.alignment = { vertical: 'middle', horizontal: columnNumber === 2 ? 'right' : 'left' };
				cell.border = border('FFE2E8F0');
				if (index % 2 === 1) {
					cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
				}
			});
		}

		sheet.addRow([]);
	}

	sheet.getColumn(1).width = 36;
	sheet.getColumn(2).width = 18;
	sheet.getColumn(3).width = 18;

	return workbook;
}

async function renderStatistics(panel: vscode.WebviewPanel): Promise<void> {
	const stats = await collectProjectStats();
	latestProjectStats = stats;
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
			.map(([extension, files]) => `<details class="file-group" open><summary><span>${escapeHtml(extension)}</span><span class="group-count">${files.length} files / ${files.reduce((total, file) => total + file.lines, 0)} lines</span></summary><ul>${files
				.map((file) => `<li><span>${escapeHtml(file.name)}</span><strong>${file.lines} lines</strong></li>`)
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
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); line-height: 1.4; margin: 0; padding: 32px clamp(18px, 5vw, 64px); }
main { max-width: 980px; margin: 0 auto; }
.topbar { align-items: end; display: flex; gap: 18px; justify-content: space-between; margin-bottom: 26px; }
h1 { font-size: 26px; margin: 0; }
.subtitle { color: var(--vscode-descriptionForeground); margin: 4px 0 0; }
.topbar-actions { display: flex; align-items: center; }
.download-button { background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); cursor: pointer; font: inherit; padding: 8px 14px; }
.download-button:hover { background: var(--vscode-button-hoverBackground); }
.controls { display: flex; gap: 8px; margin-bottom: 18px; }
input, select { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); color: var(--vscode-input-foreground); font: inherit; padding: 8px 10px; }
input { flex: 1; min-width: 180px; }
select { min-width: 130px; }
.summary { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 28px; }
.metric { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); padding: 16px 18px; }
.metric strong { display: block; font-size: 30px; color: var(--vscode-textLink-foreground); }
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
@media (max-width: 600px) { .topbar { align-items: start; flex-direction: column; } .summary { grid-template-columns: 1fr; } .controls { flex-direction: column; } }
</style>
</head>
<body>
<main>
<div class="topbar"><div><h1>Project Statistics</h1><p class="subtitle">Overview of files and lines in this workspace</p></div><div class="topbar-actions"><button id="download-csv" class="download-button" type="button">Export CSV</button><button id="download-xlsx" class="download-button" type="button" style="margin-left: 8px;">Download XLSX</button></div></div>
<div class="controls"><input id="search" type="search" placeholder="Search files..." aria-label="Search files"><select id="area-filter" aria-label="Filter by area"><option value="all">All areas</option><option value="frontend">Frontend</option><option value="backend">Backend</option><option value="other">Other</option></select></div>
<div class="summary">
<div class="metric"><strong>${stats.files.length}</strong>Total files</div>
<div class="metric"><strong>${stats.totalLines}</strong>Total lines</div>
</div>
<h2 class="section-title">Files</h2>
${areaHtml}
</main>
<script>
const vscode = acquireVsCodeApi();
const search = document.getElementById('search');
const areaFilter = document.getElementById('area-filter');
const csvContent = ${JSON.stringify(csvContent)};
function filterFiles() {
	const query = search.value.toLowerCase();
	const area = areaFilter.value;
	document.querySelectorAll('.area').forEach((areaElement) => {
		const matchesArea = area === 'all' || areaElement.dataset.area === area;
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
search.addEventListener('input', filterFiles);
areaFilter.addEventListener('change', filterFiles);
document.getElementById('download-csv').addEventListener('click', () => {
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'project-statistics.csv';
	link.click();
	URL.revokeObjectURL(url);
});
document.getElementById('download-xlsx').addEventListener('click', () => {
	vscode.postMessage({ command: 'downloadXlsx' });
});
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
		statisticsPanel.webview.onDidReceiveMessage(async (message) => {
			if (message.command !== 'downloadXlsx') {
				return;
			}

			const stats = latestProjectStats ?? await collectProjectStats();
			const workbook = await generateProjectStatsWorkbookV2(stats);
			const buffer = await workbook.xlsx.writeBuffer();
			const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(process.cwd());
			const saveUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.joinPath(defaultUri, 'project-statistics.xlsx'),
				filters: { 'Excel files': ['xlsx'] },
				saveLabel: 'Download XLSX',
			});
			if (!saveUri) {
				return;
			}
			await vscode.workspace.fs.writeFile(saveUri, Buffer.from(buffer as ArrayBuffer));
		});
		await renderStatistics(statisticsPanel);
	});

	context.subscriptions.push(disposable, statisticsCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
