import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { countLines, isSensitiveFile } from '../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('counts lines without treating a trailing newline as an extra line', () => {
		assert.strictEqual(countLines(''), 0);
		assert.strictEqual(countLines('first\nsecond\n'), 2);
		assert.strictEqual(countLines('first\r\nsecond'), 2);
	});

	test('excludes sensitive project files', () => {
		assert.strictEqual(isSensitiveFile('.env'), true);
		assert.strictEqual(isSensitiveFile('.env.example'), true);
		assert.strictEqual(isSensitiveFile('docker-compose.yml'), true);
		assert.strictEqual(isSensitiveFile('Dockerfile.dev'), true);
		assert.strictEqual(isSensitiveFile('.gitignore'), true);
		assert.strictEqual(isSensitiveFile('.npmrc'), true);
		assert.strictEqual(isSensitiveFile('config/.aws/credentials'), true);
		assert.strictEqual(isSensitiveFile('config/.kube/config'), true);
		assert.strictEqual(isSensitiveFile('server/private.key'), true);
		assert.strictEqual(isSensitiveFile('terraform.tfstate'), true);
		assert.strictEqual(isSensitiveFile('backup.sqlite'), true);
		assert.strictEqual(isSensitiveFile('package-lock.json'), false);
		assert.strictEqual(isSensitiveFile('main.cpp'), false);
	});
});
