import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as fs from 'fs';
import * as path from 'path';
import { buildCsvDownloadFileName, buildProjectStatsCsv, classifyFile, countLines, explainFileExclusion, explainSensitiveContent, fileExtensionBucket, isDotfileOrEnvFile, isGeneratedFile, isSecretKeyName, isSensitiveContent, isSensitiveFile, isWellKnownExtensionlessSource, NO_EXTENSION_BUCKET, shouldIncludeScannedFile, valueHoldsEmbeddedCredential, type ProjectStats } from '../extension';

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

	test('skips files by secret content rather than file name', () => {
		assert.strictEqual(isSensitiveContent(''), false);
		assert.strictEqual(isSensitiveContent('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'), true);
		assert.strictEqual(isSensitiveContent('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE=\n-----END OPENSSH PRIVATE KEY-----'), true);
		assert.strictEqual(isSensitiveContent('-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBA\n-----END PUBLIC KEY-----'), false);
		assert.strictEqual(isSensitiveContent('admin:$apr1$hashedpasswordvalue$remainderhashvalue'), true);
		assert.strictEqual(isSensitiveContent('SECRET_KEY=django-insecure-local-dev-value'), true);
		assert.strictEqual(isSensitiveContent('DEBUG=true\nAPP_NAME=demo\n'), false);
		assert.strictEqual(isSensitiveContent('machine api.example.com\nlogin demo\npassword ghp_notarealtokenvalue\n'), true);
		assert.strictEqual(isSensitiveContent(JSON.stringify({
			ConnectionStrings: { Default: 'Server=localhost;Password=local-dev-pass;' },
		})), true);
		assert.strictEqual(isSensitiveContent(JSON.stringify({
			compilerOptions: { strict: true, target: 'ES2022' },
		})), false);
		assert.strictEqual(isSensitiveContent('services:\n  db:\n    environment:\n      MYSQL_PASSWORD: local-dev-pass\n'), true);
		assert.strictEqual(isSensitiveContent('name: build\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n'), false);
		assert.strictEqual(isSensitiveContent("define('DB_PASSWORD', 'local-dev-pass');\ndefine('DB_NAME', 'app');"), true);
		assert.strictEqual(isSensitiveContent("SECRET_KEY = 'django-insecure-local-dev-value'\nDEBUG = True\n"), true);
	});

	test('counts ordinary source and config that only mention auth in types or names', () => {
		assert.strictEqual(isSensitiveContent('export class AuthService {\n  validateToken(token: string) {\n    return token.length > 0;\n  }\n}\n'), false);
		assert.strictEqual(isSensitiveContent('export interface Credentials {\n  apiKey: string;\n  token: string;\n}\n'), false);
		assert.strictEqual(isSensitiveContent('class TokenBucket {\n  refill() {}\n}\n'), false);
		assert.strictEqual(isSensitiveContent('function password_utils():\n    return hash_password(value)\n'), false);
		assert.strictEqual(isSensitiveContent('{\n  "name": "demo",\n  "private": true,\n  "dependencies": {}\n}\n'), false);
		assert.strictEqual(isSensitiveContent('spring.application.name=demo\nserver.port=8080\n'), false);
		assert.strictEqual(isSensitiveContent('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n'), false);
		assert.strictEqual(isSensitiveContent('export const firebaseConfig = {\n  projectId: "demo",\n  authDomain: "demo.firebaseapp.com",\n};\n'), false);
	});

	test('still skips a hardcoded secret even when the file looks like source', () => {
		assert.strictEqual(isSensitiveContent('export const firebaseConfig = {\n  apiKey: "AIzaSyNotARealKeyValue000",\n  projectId: "demo",\n};\n'), true);
		assert.strictEqual(isSensitiveContent('const password = process.env.PASSWORD;\n'), false);
	});

	test('catches abbreviated, concatenated, and service-prefixed secret key names', () => {
		assert.strictEqual(isSecretKeyName('MYSQL_ROOT_PW'), true);
		assert.strictEqual(isSecretKeyName('DB_PW'), true);
		assert.strictEqual(isSecretKeyName('ADMIN_PW'), true);
		assert.strictEqual(isSecretKeyName('REDIS_PWD'), true);
		assert.strictEqual(isSecretKeyName('secretkey'), true);
		assert.strictEqual(isSecretKeyName('apikey'), true);
		assert.strictEqual(isSecretKeyName('accesstoken'), true);
		assert.strictEqual(isSecretKeyName('STRIPE_SK'), true);
		assert.strictEqual(isSecretKeyName('AWS_SECRET'), true);
		assert.strictEqual(isSecretKeyName('GH_PAT'), true);
		assert.strictEqual(isSecretKeyName('JWT_SIGNING_KEY'), true);

		assert.strictEqual(isSensitiveContent('MYSQL_ROOT_PW=local-root-pass\n'), true);
		assert.strictEqual(isSensitiveContent('DB_PW=local-db-pass\n'), true);
		assert.strictEqual(isSensitiveContent('ADMIN_PW=local-admin-pass\n'), true);
		assert.strictEqual(isSensitiveContent('REDIS_PWD=local-redis-pass\n'), true);
		assert.strictEqual(isSensitiveContent('secretkey=local-secret-value\n'), true);
		assert.strictEqual(isSensitiveContent('apikey=local-api-key-value\n'), true);
		assert.strictEqual(isSensitiveContent('accesstoken=local-access-token\n'), true);
		assert.strictEqual(isSensitiveContent('STRIPE_SK=sk_test_notarealkey\n'), true);
		assert.strictEqual(isSensitiveContent('AWS_SECRET=local-aws-secret\n'), true);
		assert.strictEqual(isSensitiveContent('GH_PAT=ghp_notarealtokenvalue\n'), true);
		assert.strictEqual(isSensitiveContent('JWT_SIGNING_KEY=local-jwt-signing-value\n'), true);
	});

	test('flags connection strings with embedded credentials even when the key is unrelated', () => {
		assert.strictEqual(valueHoldsEmbeddedCredential('postgres://user:realpassword@localhost:5432/db'), true);
		assert.strictEqual(valueHoldsEmbeddedCredential('redis://default:local-redis-pass@localhost:6379/0'), true);
		assert.strictEqual(valueHoldsEmbeddedCredential('mongodb://app:local-mongo-pass@localhost:27017/app'), true);
		assert.strictEqual(valueHoldsEmbeddedCredential('amqp://guest:local-amqp-pass@localhost:5672/'), true);
		assert.strictEqual(valueHoldsEmbeddedCredential('postgres://user:${PASSWORD}@localhost:5432/db'), false);
		assert.strictEqual(valueHoldsEmbeddedCredential('postgres://user:changeme@localhost:5432/db'), false);
		assert.strictEqual(valueHoldsEmbeddedCredential('jdbc:mysql://userdb:3306/userdb'), false);

		assert.strictEqual(isSensitiveContent('APP_DSN=postgres://user:realpassword@localhost:5432/db\n'), true);
		assert.strictEqual(isSensitiveContent('PRIMARY=redis://default:local-redis-pass@localhost:6379/0\n'), true);
		assert.strictEqual(isSensitiveContent('MONGO_URI=mongodb://app:local-mongo-pass@localhost:27017/app\n'), true);
		assert.strictEqual(isSensitiveContent('AMQP_URL=amqp://guest:local-amqp-pass@localhost:5672/\n'), true);
		assert.strictEqual(isSensitiveContent('APP_DSN=postgres://user:${PASSWORD}@localhost:5432/db\n'), false);
		assert.strictEqual(isSensitiveContent('USERDB_URL=jdbc:mysql://userdb:3306/userdb\n'), false);
	});

	test('does not flag ordinary non-secret env entries or placeholders', () => {
		assert.strictEqual(isSensitiveContent('COMPOSE_PROJECT_NAME=my-app\nNODE_ENV=production\nPORT=3000\n'), false);
		assert.strictEqual(isSensitiveContent('DEBUG=true\nAPP_NAME=demo\nLOG_LEVEL=info\n'), false);
		assert.strictEqual(isSensitiveContent('MYSQL_ROOT_PW=changeme\n'), false);
		assert.strictEqual(isSensitiveContent('DB_PW=${DB_PASSWORD}\n'), false);
		assert.strictEqual(isSensitiveContent('SECRET_KEY=placeholder\n'), false);
		assert.strictEqual(isSensitiveContent('GH_PAT=your-token-here\n'), false);
		assert.strictEqual(isSecretKeyName('COMPOSE_PROJECT_NAME'), false);
		assert.strictEqual(isSecretKeyName('NODE_ENV'), false);
		assert.strictEqual(isSecretKeyName('PORT'), false);
		assert.strictEqual(isSecretKeyName('CONTRASENA'), false);
		assert.strictEqual(isSensitiveContent('CONTRASENA=supersecret123\n'), false);
		assert.strictEqual(isSensitiveContent('NOMBRE_APP=mi-app\n'), false);
	});

	test('drops known secret files by name, then other files by content', () => {
		assert.strictEqual(isSensitiveFile('docker-compose.yml'), false);
		assert.strictEqual(isSensitiveFile('Dockerfile'), false);
		assert.strictEqual(isSensitiveFile('nginx.conf'), false);
		assert.strictEqual(isSensitiveFile('application.properties'), false);
		assert.strictEqual(isSensitiveFile('application-prod.yml'), false);
		assert.strictEqual(isSensitiveFile('appsettings.Development.json'), true);
		assert.strictEqual(isSensitiveFile('app/settings.py'), true);
		assert.strictEqual(isSensitiveFile('wp-config.php'), true);
		assert.strictEqual(isSensitiveFile('server/private.key'), true);
		assert.strictEqual(isSensitiveFile('server.crt'), true);
		assert.strictEqual(isSensitiveFile('google-services.json'), true);
		assert.strictEqual(isSensitiveFile('src/UserService.java'), false);
		assert.strictEqual(isSensitiveFile('src/AuthService.ts'), false);
		assert.strictEqual(isSensitiveFile('src/app.go'), false);
		assert.strictEqual(isSensitiveFile('main.c'), false);
		assert.strictEqual(isSensitiveFile('LICENSE'), false);

		assert.strictEqual(shouldIncludeScannedFile('docker-compose.yml', 'version: "3"\nservices:\n  web:\n    image: nginx\n'), true);
		assert.strictEqual(shouldIncludeScannedFile('docker-compose.yml', 'services:\n  db:\n    environment:\n      MYSQL_ROOT_PASSWORD: mysecret\n'), false);
		assert.strictEqual(shouldIncludeScannedFile('src/UserService.java', 'class UserService {}\n'), true);
		assert.strictEqual(shouldIncludeScannedFile('src/UserService.java', 'String password = "local-dev-pass";\n'), false);
		assert.strictEqual(shouldIncludeScannedFile('notes.txt', 'APP_DSN=postgres://user:realpassword@localhost:5432/db\n'), false);
		assert.strictEqual(shouldIncludeScannedFile('README.md', '# Demo app\n'), true);
	});

	test('drops .env files by name even when the content is harmless', () => {
		const realEnv = [
			'# env for docker compose, https://docs.docker.com/compose/env-file/',
			'COMPOSE_CONVERT_WINDOWS_PATHS=1',
			'',
		].join('\n');

		assert.strictEqual(isSensitiveContent(realEnv), false);
		assert.strictEqual(isDotfileOrEnvFile('.env'), true);
		assert.strictEqual(isDotfileOrEnvFile('.env.production'), true);
		assert.strictEqual(isDotfileOrEnvFile('local.env'), true);
		assert.strictEqual(isDotfileOrEnvFile('.editorconfig'), false);
		assert.strictEqual(isDotfileOrEnvFile('.gitmodules'), false);
		assert.strictEqual(isDotfileOrEnvFile('.gitkeep'), false);
		assert.strictEqual(isDotfileOrEnvFile('LICENSE'), false);
		assert.strictEqual(isDotfileOrEnvFile('Dockerfile'), false);
		assert.strictEqual(shouldIncludeScannedFile('.env', realEnv), false);
		assert.strictEqual(shouldIncludeScannedFile('.editorconfig', 'root = true\n'), true);
		assert.strictEqual(shouldIncludeScannedFile('LICENSE', 'MIT License\n'), true);
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
			'Name,Extension,No. of lines',
			'classifier.py,.py,326',
			'package.json,.json,27',
			'styles.css,.css,42',
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

	test('includes ordinary extensionless files in the No extension bucket', () => {
		assert.strictEqual(fileExtensionBucket('mvnw'), NO_EXTENSION_BUCKET);
		assert.strictEqual(fileExtensionBucket('LICENSE'), NO_EXTENSION_BUCKET);
		assert.strictEqual(fileExtensionBucket('.env'), NO_EXTENSION_BUCKET);
		assert.strictEqual(fileExtensionBucket('app.js'), '.js');
		assert.strictEqual(isWellKnownExtensionlessSource('Dockerfile'), true);
		assert.strictEqual(isWellKnownExtensionlessSource('makefile'), true);
		assert.strictEqual(isWellKnownExtensionlessSource('Jenkinsfile'), true);
		assert.strictEqual(isWellKnownExtensionlessSource('LICENSE'), false);

		assert.strictEqual(shouldIncludeScannedFile('mvnw', '#!/bin/sh\necho build\n'), true);
		assert.strictEqual(shouldIncludeScannedFile('LICENSE', 'MIT License\nCopyright 2026\n'), true);
		assert.strictEqual(shouldIncludeScannedFile('Dockerfile', 'FROM node:20\nWORKDIR /app\n'), true);
		assert.strictEqual(shouldIncludeScannedFile('Makefile', 'build:\n\techo ok\n'), true);
	});

	test('still excludes extensionless files that fail generated, binary, or sensitive checks', () => {
		assert.strictEqual(shouldIncludeScannedFile('mvnw', 'password=supersecret123\n'), false);
		assert.strictEqual(shouldIncludeScannedFile('Dockerfile', 'password=supersecret123\n'), false);
		assert.strictEqual(isSensitiveContent('password=supersecret123\n'), true);
		assert.strictEqual(shouldIncludeScannedFile('notes.txt', 'password=supersecret123\n'), false);
		assert.strictEqual(isGeneratedFile('.gitignore'), true);
		assert.strictEqual(shouldIncludeScannedFile('.gitignore', 'node_modules\n'), false);
		assert.strictEqual(isGeneratedFile('dist/mvnw'), true);
		assert.strictEqual(shouldIncludeScannedFile('dist/mvnw', '#!/bin/sh\necho build\n'), false);

		const withExtensionless = {
			files: [
				{ name: 'app.js', directory: '', extension: '.js', area: 'Frontend' as const, lines: 10 },
				{ name: 'LICENSE', directory: '', extension: NO_EXTENSION_BUCKET, area: 'Other' as const, lines: 4 },
			],
			totalLines: 14,
		};
		const csv = buildProjectStatsCsv(withExtensionless);
		assert.ok(csv.includes('LICENSE,No extension,4'));
		assert.ok(csv.includes('Total Files,2'));
		assert.ok(csv.includes('Total Lines,14'));
	});

	test('does not flag the spring-microservice-sample false-positive files', () => {
		const dockerfile = [
			'FROM adoptopenjdk:8-jre',
			'VOLUME /tmp',
			'ADD ./target/auth-service-0.0.1-SNAPSHOT.jar app.jar',
			'RUN sh -c \'touch /app.jar\'',
			'ENV JAVA_OPTS=""',
			'ENTRYPOINT [ "sh", "-c", "java $JAVA_OPTS -Djava.security.egd=file:/dev/./urandom -jar /app.jar" ]',
			'',
		].join('\n');
		const composeHostsOnly = [
			'version: \'3.1\'',
			'services:',
			'  auth-service:',
			'    image: hantsy/auth-service',
			'    environment:',
			'      SERVICES_USER_SERVICE_URL: http://user-service:8001',
			'      SPRING_REDIS_HOST: redis',
			'      SPRING_DATASOURCE_URL: jdbc:mysql://userdb:3306/userdb',
			'    ports:',
			'      - "8000:8000"',
			'',
		].join('\n');
		const nginxConf = [
			'worker_processes 1;',
			'events { worker_connections 1024; }',
			'http {',
			'	server {',
			'		listen 80;',
			'		location /users {',
			'			proxy_pass http://user-service:8001;',
			'		}',
			'		location / {',
			'			proxy_pass http://auth-service:8000;',
			'		}',
			'	}',
			'}',
			'',
		].join('\n');
		const mavenWrapper = 'distributionUrl=https://repo1.maven.org/maven2/org/apache/maven/apache-maven/3.5.0/apache-maven-3.5.0-bin.zip\n';
		const editorconfig = [
			'root = true',
			'[*]',
			'charset = utf-8',
			'indent_style = space',
			'indent_size = 2',
			'',
		].join('\n');

		assert.strictEqual(isSensitiveContent(dockerfile), false);
		assert.strictEqual(isSensitiveContent(composeHostsOnly), false);
		assert.strictEqual(isSensitiveContent(nginxConf), false);
		assert.strictEqual(isSensitiveContent(mavenWrapper), false);
		assert.strictEqual(isSensitiveContent(''), false);
		assert.strictEqual(isSensitiveContent('[submodule "ui"]\n\tpath = ui\n'), false);
		assert.strictEqual(isSensitiveContent(editorconfig), false);
		assert.strictEqual(explainSensitiveContent(dockerfile), undefined);
		assert.strictEqual(explainSensitiveContent(composeHostsOnly), undefined);
		assert.strictEqual(explainSensitiveContent(nginxConf), undefined);
		assert.strictEqual(explainSensitiveContent(mavenWrapper), undefined);
		assert.strictEqual(explainSensitiveContent(''), undefined);

		assert.strictEqual(shouldIncludeScannedFile('auth-service/Dockerfile', dockerfile), true);
		assert.strictEqual(shouldIncludeScannedFile('docker-compose.local.yml', composeHostsOnly), true);
		assert.strictEqual(shouldIncludeScannedFile('nginx/nginx.conf', nginxConf), true);
		assert.strictEqual(shouldIncludeScannedFile('.mvn/wrapper/maven-wrapper.properties', mavenWrapper), true);
		assert.strictEqual(shouldIncludeScannedFile('src/main/resources/application.properties', ''), true);
		assert.strictEqual(explainFileExclusion('src/main/resources/application.properties', '').skipped, false);
		assert.strictEqual(shouldIncludeScannedFile('.gitmodules', ''), true);
		assert.strictEqual(shouldIncludeScannedFile('ui/src/assets/.gitkeep', ''), true);
		assert.strictEqual(shouldIncludeScannedFile('ui/.editorconfig', editorconfig), true);

		assert.strictEqual(shouldIncludeScannedFile('LICENSE', 'MIT License\n'.repeat(675)), true);
		assert.strictEqual(shouldIncludeScannedFile('mvnw', '#!/bin/sh\n'.repeat(226)), true);

		assert.deepStrictEqual(
			explainSensitiveContent('DATABASE_URL=postgres://user:realpass123@host:5432/db\n'),
			{ check: 'connection-string', line: 'DATABASE_URL=postgres://user:realpass123@host:5432/db' },
		);
		assert.deepStrictEqual(
			explainSensitiveContent('DB_PW=hunter2\n'),
			{ check: 'assignmentsHoldSecrets', line: 'DB_PW=hunter2' },
		);
		assert.strictEqual(shouldIncludeScannedFile('notes.txt', 'DATABASE_URL=postgres://user:realpass123@host:5432/db\n'), false);
		assert.strictEqual(shouldIncludeScannedFile('notes.txt', 'DB_PW=hunter2\n'), false);
		assert.strictEqual(
			shouldIncludeScannedFile('docker-compose.yml', 'services:\n  db:\n    environment:\n      MYSQL_ROOT_PASSWORD: mysecret\n      MYSQL_PASSWORD: password\n'),
			false,
		);
	});

	test('recounts hantsy/spring-microservice-sample after the false-positive fix', function () {
		const root = path.join(process.env.TEMP || process.env.TMP || '', 'spring-microservice-sample');
		if (!fs.existsSync(root)) {
			this.skip();
		}

		const skipDir = /(^|\\|\/)(node_modules|bower_components|vendor|\.git|\.svn|\.hg|dist|build|out|target|obj|\.gradle|\.idea|\.vs|\.vscode-test|__pycache__|\.pytest_cache|\.mypy_cache|\.venv|venv|site-packages|coverage|\.nyc_output|\.next|\.nuxt|\.svelte-kit|\.turbo|\.terraform)(\\|\/)/;
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				const rel = path.relative(root, full).replaceAll('\\', '/');
				if (entry.isDirectory()) {
					if (!skipDir.test(`${rel}/`)) {
						walk(full);
					}
					continue;
				}
				files.push(rel);
			}
		};
		walk(root);

		let includedFiles = 0;
		let includedLines = 0;
		let licenseLines = 0;
		let mvnwLines = 0;
		const previouslyDropped = [
			'auth-service/Dockerfile',
			'nginx/Dockerfile',
			'pact/Dockerfile',
			'post-service/Dockerfile',
			'registry/Dockerfile',
			'ui/Dockerfile',
			'user-service/Dockerfile',
			'docker-compose.yml',
			'docker-compose.ui.yml',
			'docker-compose.registry.yml',
			'docker-compose.pact.yml',
			'docker-compose.local.yml',
			'docker-compose.build.yml',
			'nginx/nginx.conf',
			'pact/nginx.conf',
			'pact/ssl/nginx.conf',
			'ui/nginx.conf',
			'.mvn/wrapper/maven-wrapper.properties',
			'contracts/user-service-producer/.mvn/wrapper/maven-wrapper.properties',
			'contracts/user-service-producer/src/main/resources/application.properties',
			'.gitmodules',
			'ui/src/assets/.gitkeep',
			'ui/.editorconfig',
			'pact/ssl/nginx-selfsigned.crt',
			'registry/certs/domain.crt',
			'auth-service/src/main/resources/application.yml',
		];
		const restored: string[] = [];
		const stillExcluded: string[] = [];
		const otherExcluded: string[] = [];

		for (const rel of files) {
			const content = fs.readFileSync(path.join(root, rel), 'utf8');
			const explanation = explainFileExclusion(rel, content);
			const lines = countLines(content);
			if (!explanation.skipped) {
				includedFiles += 1;
				includedLines += lines;
			} else if (explanation.by !== 'generated' && explanation.by !== 'binary' && !previouslyDropped.includes(rel)) {
				otherExcluded.push(`${rel} [${explanation.by}${explanation.detail ? `/${explanation.detail.check}${explanation.detail.line ? `:${explanation.detail.line}` : ''}` : ''}]`);
			}
			if (rel === 'LICENSE' || rel.endsWith('/LICENSE')) {
				assert.strictEqual(explanation.skipped, false, 'LICENSE must remain included');
				licenseLines = lines;
			}
			if (rel === 'mvnw' || rel.endsWith('/mvnw')) {
				if (rel === 'mvnw') {
					assert.strictEqual(explanation.skipped, false, 'root mvnw must remain included');
					mvnwLines = lines;
				}
			}
			if (previouslyDropped.includes(rel)) {
				if (explanation.skipped) {
					stillExcluded.push(`${rel} [${explanation.by}${explanation.detail ? `/${explanation.detail.check}${explanation.detail.line ? `:${explanation.detail.line}` : ''}` : ''}]`);
				} else {
					restored.push(rel);
				}
			}
		}

		console.log(JSON.stringify({
			includedFiles,
			includedLines,
			licenseLines,
			mvnwLines,
			restored,
			stillExcluded,
			otherExcluded,
		}, null, 2));

		assert.ok(includedFiles > 205, `expected more than the 205-file regression, got ${includedFiles}`);
		assert.ok(restored.includes('auth-service/Dockerfile'));
		assert.ok(restored.includes('docker-compose.local.yml'));
		assert.ok(restored.includes('nginx/nginx.conf'));
		assert.ok(restored.includes('contracts/user-service-producer/src/main/resources/application.properties'));
		assert.ok(stillExcluded.some((item) => item.startsWith('docker-compose.yml ')));
		assert.ok(stillExcluded.some((item) => item.startsWith('pact/ssl/nginx-selfsigned.crt ')));
	});
});
