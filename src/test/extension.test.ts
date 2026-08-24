import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { classifyFile, countLines, isSensitiveFile } from '../extension';

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
		assert.strictEqual(isSensitiveFile('DBconfig.java'), true);
		assert.strictEqual(isSensitiveFile('src/private/Database.java'), true);
		assert.strictEqual(isSensitiveFile('application-prod.properties'), true);
		assert.strictEqual(isSensitiveFile('application.yaml'), true);
		assert.strictEqual(isSensitiveFile('certs/server.jks'), true);
		assert.strictEqual(isSensitiveFile('deployment.tfvars'), true);
		assert.strictEqual(isSensitiveFile('target/App.class'), true);
		assert.strictEqual(isSensitiveFile('src/.idea/workspace.xml'), true);
		assert.strictEqual(isSensitiveFile('local.env'), true);
		assert.strictEqual(isSensitiveFile('gcp-credentials.json'), true);
		assert.strictEqual(isSensitiveFile('src/UserService.java'), false);
		assert.strictEqual(isSensitiveFile('package-lock.json'), false);
		assert.strictEqual(isSensitiveFile('main.c'), false);
		assert.strictEqual(isSensitiveFile('main.cpp'), false);
		assert.strictEqual(isSensitiveFile('header.h'), false);
		assert.strictEqual(isSensitiveFile('script.rb'), false);
		assert.strictEqual(isSensitiveFile('index.php'), false);
		assert.strictEqual(isSensitiveFile('app.go'), false);
		assert.strictEqual(isSensitiveFile('server.rs'), false);
		assert.strictEqual(isSensitiveFile('main.kt'), false);
		assert.strictEqual(isSensitiveFile('src/DatabaseConfig.php'), true);
		assert.strictEqual(isSensitiveFile('src/App.tsx'), false);
		assert.strictEqual(isSensitiveFile('src/App.jsx'), false);
		assert.strictEqual(isSensitiveFile('src/App.vue'), false);
		assert.strictEqual(isSensitiveFile('src/App.svelte'), false);
		assert.strictEqual(isSensitiveFile('src/index.html'), false);
		assert.strictEqual(isSensitiveFile('src/styles.css'), false);
		assert.strictEqual(isSensitiveFile('src/firebaseConfig.ts'), true);
		assert.strictEqual(isSensitiveFile('public/api-keys.js'), true);
		assert.strictEqual(isSensitiveFile('client_secret.json'), true);
		assert.strictEqual(classifyFile('frontend/App.tsx', '.tsx'), 'Frontend');
		assert.strictEqual(classifyFile('client/styles.css', '.css'), 'Frontend');
		assert.strictEqual(classifyFile('backend/OrderService.java', '.java'), 'Backend');
		assert.strictEqual(classifyFile('api/routes.rb', '.rb'), 'Backend');
		assert.strictEqual(classifyFile('src/shared/types.ts', '.ts'), 'Frontend');
		assert.strictEqual(classifyFile('README.md', '.md'), 'Other');
	});
});
