import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { buildCsvDownloadFileName, buildProjectStatsCsv, classifyFile, countLines, isGeneratedFile, isSensitiveFile, type ProjectStats } from '../extension';

suite('Extension Test Suite', () => {
	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('counts every line including a trailing blank line', () => {
		assert.strictEqual(countLines(''), 0);
		assert.strictEqual(countLines('first\nsecond\n'), 3);
		assert.strictEqual(countLines('first\r\nsecond'), 2);
		assert.strictEqual(countLines('first\n\n'), 3);
	});

	test('excludes secrets that are shared across every ecosystem', () => {
		assert.strictEqual(isSensitiveFile('.env'), true);
		assert.strictEqual(isSensitiveFile('.env.example'), true);
		assert.strictEqual(isSensitiveFile('.env.production'), true);
		assert.strictEqual(isSensitiveFile('local.env'), true);
		assert.strictEqual(isSensitiveFile('docker-compose.yml'), true);
		assert.strictEqual(isSensitiveFile('Dockerfile.dev'), true);
		assert.strictEqual(isSensitiveFile('config/.aws/credentials'), true);
		assert.strictEqual(isSensitiveFile('config/.kube/config'), true);
		assert.strictEqual(isSensitiveFile('server/private.key'), true);
		assert.strictEqual(isSensitiveFile('gcp-credentials.json'), true);
		assert.strictEqual(isSensitiveFile('client_secret.json'), true);
		assert.strictEqual(isSensitiveFile('.netrc'), true);
		assert.strictEqual(isSensitiveFile('.htpasswd'), true);
		assert.strictEqual(isSensitiveFile('.pgpass'), true);
		assert.strictEqual(isSensitiveFile('.my.cnf'), true);
		assert.strictEqual(isSensitiveFile('.s3cfg'), true);
		assert.strictEqual(isSensitiveFile('.git-credentials'), true);
		assert.strictEqual(isSensitiveFile('ssh/id_dsa'), true);
		assert.strictEqual(isSensitiveFile('ssh/id_ecdsa'), true);
		assert.strictEqual(isSensitiveFile('keys/client.ppk'), true);
		assert.strictEqual(isSensitiveFile('certs/server.jks'), true);
		assert.strictEqual(isSensitiveFile('certs/server.der'), true);
		assert.strictEqual(isSensitiveFile('auth.p8'), true);
		assert.strictEqual(isSensitiveFile('secring.gpg'), true);
		assert.strictEqual(isSensitiveFile('key.asc'), true);
		assert.strictEqual(isSensitiveFile('passwords.kdbx'), true);
		assert.strictEqual(isSensitiveFile('vendor/private-data.txt'), true);
		assert.strictEqual(isSensitiveFile('ssh/id_rsa.pub'), false);
	});

	test('excludes language specific credential files', () => {
		// Python
		assert.strictEqual(isSensitiveFile('app/settings.py'), true);
		assert.strictEqual(isSensitiveFile('app/local_settings.py'), true);
		assert.strictEqual(isSensitiveFile('app/settings/base.py'), true);
		assert.strictEqual(isSensitiveFile('pip.conf'), true);
		assert.strictEqual(isSensitiveFile('.pypirc'), true);
		// Java, Spring, Gradle and Android
		assert.strictEqual(isSensitiveFile('application-prod.properties'), true);
		assert.strictEqual(isSensitiveFile('application.yaml'), true);
		assert.strictEqual(isSensitiveFile('resources/application-prod.yml'), true);
		assert.strictEqual(isSensitiveFile('resources/bootstrap.yml'), true);
		assert.strictEqual(isSensitiveFile('gradle.properties'), true);
		assert.strictEqual(isSensitiveFile('local.properties'), true);
		assert.strictEqual(isSensitiveFile('keystore.properties'), true);
		assert.strictEqual(isSensitiveFile('.m2/settings.xml'), true);
		assert.strictEqual(isSensitiveFile('DBconfig.java'), true);
		// .NET
		assert.strictEqual(isSensitiveFile('appsettings.json'), true);
		assert.strictEqual(isSensitiveFile('appsettings.Development.json'), true);
		assert.strictEqual(isSensitiveFile('Web.config'), true);
		assert.strictEqual(isSensitiveFile('Properties/PublishProfiles/prod.pubxml'), true);
		// Node
		assert.strictEqual(isSensitiveFile('.npmrc'), true);
		assert.strictEqual(isSensitiveFile('serviceAccountKey.json'), true);
		assert.strictEqual(isSensitiveFile('src/firebaseConfig.ts'), true);
		assert.strictEqual(isSensitiveFile('public/api-keys.js'), true);
		assert.strictEqual(isSensitiveFile('config/default.json'), true);
		// Ruby and PHP
		assert.strictEqual(isSensitiveFile('config/database.yml'), true);
		assert.strictEqual(isSensitiveFile('config/master.key'), true);
		assert.strictEqual(isSensitiveFile('config/credentials.yml.enc'), true);
		assert.strictEqual(isSensitiveFile('wp-config.php'), true);
		assert.strictEqual(isSensitiveFile('src/DatabaseConfig.php'), true);
		// Rust, Go and infrastructure
		assert.strictEqual(isSensitiveFile('.cargo/credentials.toml'), true);
		assert.strictEqual(isSensitiveFile('config.yaml'), true);
		assert.strictEqual(isSensitiveFile('terraform.tfstate'), true);
		assert.strictEqual(isSensitiveFile('deployment.tfvars'), true);
		assert.strictEqual(isSensitiveFile('terraform.tfvars.json'), true);
		assert.strictEqual(isSensitiveFile('k8s/secret.yaml'), true);
		assert.strictEqual(isSensitiveFile('helm/values.yaml'), true);
		assert.strictEqual(isSensitiveFile('ansible/group_vars/all/vault.yml'), true);
		// Mobile
		assert.strictEqual(isSensitiveFile('app/google-services.json'), true);
		assert.strictEqual(isSensitiveFile('Runner/GoogleService-Info.plist'), true);
		assert.strictEqual(isSensitiveFile('Config/Release.xcconfig'), true);
		assert.strictEqual(isSensitiveFile('android/key.properties'), true);
		assert.strictEqual(isSensitiveFile('instance/config.py'), true);
		assert.strictEqual(isSensitiveFile('config/prod.secret.exs'), true);
		assert.strictEqual(isSensitiveFile('conf/application.conf'), true);
		assert.strictEqual(isSensitiveFile('.streamlit/secrets.toml'), true);
	});

	test('counts ordinary source files instead of hiding them', () => {
		assert.strictEqual(isSensitiveFile('src/UserService.java'), false);
		assert.strictEqual(isSensitiveFile('main.c'), false);
		assert.strictEqual(isSensitiveFile('main.cpp'), false);
		assert.strictEqual(isSensitiveFile('header.h'), false);
		assert.strictEqual(isSensitiveFile('script.rb'), false);
		assert.strictEqual(isSensitiveFile('index.php'), false);
		assert.strictEqual(isSensitiveFile('app.go'), false);
		assert.strictEqual(isSensitiveFile('server.rs'), false);
		assert.strictEqual(isSensitiveFile('main.kt'), false);
		assert.strictEqual(isSensitiveFile('src/App.tsx'), false);
		assert.strictEqual(isSensitiveFile('src/App.jsx'), false);
		assert.strictEqual(isSensitiveFile('src/App.vue'), false);
		assert.strictEqual(isSensitiveFile('src/App.svelte'), false);
		assert.strictEqual(isSensitiveFile('src/index.html'), false);
		assert.strictEqual(isSensitiveFile('src/styles.css'), false);
		assert.strictEqual(isSensitiveFile('src/AuthService.ts'), false);
		assert.strictEqual(isSensitiveFile('src/TokenBucket.java'), false);
		assert.strictEqual(isSensitiveFile('src/DatabaseConnection.ts'), false);
		// Build tooling written in a real language is code, not a secret.
		assert.strictEqual(isSensitiveFile('webpack.config.js'), false);
		assert.strictEqual(isSensitiveFile('vite.config.ts'), false);
		assert.strictEqual(isSensitiveFile('jest.config.js'), false);
		assert.strictEqual(isSensitiveFile('tailwind.config.js'), false);
		assert.strictEqual(isSensitiveFile('tsconfig.json'), false);
		// Rails keeps real source code under config/.
		assert.strictEqual(isSensitiveFile('config/routes.rb'), false);
		assert.strictEqual(isSensitiveFile('config/application.rb'), false);
		assert.strictEqual(isSensitiveFile('config/environments/production.rb'), false);
		assert.strictEqual(isSensitiveFile('src/keys/KeyboardShortcuts.ts'), false);
		assert.strictEqual(isSensitiveFile('src/private/UserRepository.java'), false);
		assert.strictEqual(isSensitiveFile('app/password_utils.py'), false);
		assert.strictEqual(isSensitiveFile('app/config_loader.py'), false);
		assert.strictEqual(isSensitiveFile('package-lock.json'), false);
		// Java resource bundles are translations, not credentials.
		assert.strictEqual(isSensitiveFile('resources/messages_en.properties'), false);
		assert.strictEqual(isSensitiveFile('resources/messages.properties'), false);
		assert.strictEqual(isSensitiveFile('resources/labels_en_us.properties'), false);
		assert.strictEqual(isSensitiveFile('resources/credentials_en.properties'), true);
		// Elixir, Laravel and Play keep source code beside their config.
		assert.strictEqual(isSensitiveFile('config/runtime.exs'), false);
		assert.strictEqual(isSensitiveFile('config/app.php'), false);
		assert.strictEqual(isSensitiveFile('k8s/deployment.yaml'), false);
		assert.strictEqual(isSensitiveFile('Runner/Info.plist'), false);
	});

	test('excludes generated and binary files from the line count', () => {
		assert.strictEqual(isGeneratedFile('media/icon.png'), true);
		assert.strictEqual(isGeneratedFile('assets/logo.jpg'), true);
		assert.strictEqual(isGeneratedFile('fonts/Inter.woff2'), true);
		assert.strictEqual(isGeneratedFile('lib/app.jar'), true);
		assert.strictEqual(isGeneratedFile('bin/tool.exe'), true);
		assert.strictEqual(isGeneratedFile('archive.zip'), true);
		assert.strictEqual(isGeneratedFile('documents/report.pdf'), true);
		assert.strictEqual(isGeneratedFile('backup.sqlite'), true);
		assert.strictEqual(isGeneratedFile('target/App.class'), true);
		assert.strictEqual(isGeneratedFile('src/.idea/workspace.xml'), true);
		assert.strictEqual(isGeneratedFile('old/config.old'), true);
		assert.strictEqual(isGeneratedFile('.gitignore'), true);
		assert.strictEqual(isGeneratedFile('auth-service/.gitignore'), true);
		assert.strictEqual(isGeneratedFile('package-lock.json'), true);
		assert.strictEqual(isGeneratedFile('yarn.lock'), true);
		assert.strictEqual(isGeneratedFile('dist/bundle.min.js'), true);
		assert.strictEqual(isGeneratedFile('src/UserService.java'), false);
		assert.strictEqual(isGeneratedFile('src/App.tsx'), false);
		assert.strictEqual(isGeneratedFile('README.md'), false);
	});

	test('handles a polyglot microservices monorepo', () => {
		// Swarm stack files carry the same environment secrets as compose files.
		assert.strictEqual(isSensitiveFile('docker-stack.yml'), true);
		assert.strictEqual(isSensitiveFile('docker-stack.prod.yml'), true);
		assert.strictEqual(isSensitiveFile('docker-compose.registry.yml'), true);
		// A Docker registry writes htpasswd without the Apache leading dot.
		assert.strictEqual(isSensitiveFile('registry/auth/htpasswd'), true);
		assert.strictEqual(isSensitiveFile('.htpasswd'), true);
		assert.strictEqual(isSensitiveFile('registry/certs/domain.key'), true);
		assert.strictEqual(isSensitiveFile('pact/ssl/nginx-selfsigned.key'), true);
		assert.strictEqual(isSensitiveFile('auth-service/src/main/resources/application.yml'), true);
		assert.strictEqual(isSensitiveFile('services/billing/appsettings.Production.json'), true);
		assert.strictEqual(isSensitiveFile('deploy/charts/payment/values.yaml'), true);
		// A type declaration describes a credential shape, it does not hold one.
		assert.strictEqual(isSensitiveFile('ui/src/app/core/credentials.model.ts'), false);
		assert.strictEqual(isSensitiveFile('public/api-keys.js'), true);
		assert.strictEqual(isSensitiveFile('services/payment-service/cmd/server/main.go'), false);
		assert.strictEqual(isSensitiveFile('ui/src/app/app.component.ts'), false);
		assert.strictEqual(isSensitiveFile('.github/workflows/maven.yml'), false);
	});

	test('classifies files by area', () => {
		// A Spring controller lives in a package named web but is backend code.
		assert.strictEqual(classifyFile('auth-service/src/main/java/com/example/auth/web/AuthenticationController.java', '.java'), 'Backend');
		assert.strictEqual(classifyFile('user-service/src/main/java/com/example/user/web/UserForm.java', '.java'), 'Backend');
		// An Angular app keeps its area even when the service folder is a compound name.
		assert.strictEqual(classifyFile('ui/src/app/app.component.ts', '.ts'), 'Frontend');
		assert.strictEqual(classifyFile('services/web-ui/src/App.tsx', '.tsx'), 'Frontend');
		assert.strictEqual(classifyFile('services/admin-dashboard/styles.css', '.css'), 'Frontend');
		assert.strictEqual(classifyFile('services/web-ui/src/index.ts', '.ts'), 'Frontend');
		assert.strictEqual(classifyFile('services/auth-service/src/index.ts', '.ts'), 'Backend');
		assert.strictEqual(classifyFile('frontend/App.tsx', '.tsx'), 'Frontend');
		assert.strictEqual(classifyFile('client/styles.css', '.css'), 'Frontend');
		assert.strictEqual(classifyFile('backend/OrderService.java', '.java'), 'Backend');
		assert.strictEqual(classifyFile('api/routes.rb', '.rb'), 'Backend');
		assert.strictEqual(classifyFile('src/shared/types.ts', '.ts'), 'Frontend');
		assert.strictEqual(classifyFile('README.md', '.md'), 'Other');
	});

	test('builds a CSV of filenames and line counts only', () => {
		const stats: ProjectStats = {
			files: [
				{ name: 'classifier.py', directory: 'app/reasoning', extension: '.py', area: 'Backend', lines: 326 },
				{ name: 'package.json', directory: '', extension: '.json', area: 'Frontend', lines: 27 },
				{ name: 'styles.css', directory: 'ui', extension: '.css', area: 'Frontend', lines: 42 },
			],
			totalLines: 395,
		};

		const csv = buildProjectStatsCsv(stats);
		assert.strictEqual(csv, [
			'Total Files,3',
			'Total Lines,395',
			'',
			'Name,No. of lines',
			'classifier.py,326',
			'package.json,27',
			'styles.css,42',
		].join('\r\n'));
		assert.ok(!csv.includes('app/reasoning'));
		assert.ok(!csv.includes('Frontend'));
		assert.ok(!csv.includes('Backend'));
	});

	test('names each CSV export with the project, date, and time', () => {
		const now = new Date(2026, 7, 25, 19, 14, 32);
		assert.strictEqual(
			buildCsvDownloadFileName('AI_Automation_Advisor', now),
			'AI_Automation_Advisor_AIStudioFileStats_20260825_191432.csv',
		);
		assert.strictEqual(
			buildCsvDownloadFileName('my project: v2', now),
			'my_project_v2_AIStudioFileStats_20260825_191432.csv',
		);
		assert.strictEqual(
			buildCsvDownloadFileName('', now),
			'Project_AIStudioFileStats_20260825_191432.csv',
		);
	});
});
