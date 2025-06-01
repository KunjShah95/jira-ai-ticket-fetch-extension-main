import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ITestingService, TestResults, TestFailure } from '../types';

export class TestingService implements ITestingService {
	private workspaceRoot: string;

	constructor() {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			throw new Error('No workspace folder found');
		}
		this.workspaceRoot = workspaceFolder.uri.fsPath;
	}

	public async runTests(testPattern?: string): Promise<TestResults> {
		try {
			const testFramework = await this.detectTestFramework();
			switch (testFramework) {
				case 'jest':
					return await this.runJestTests(testPattern);
				case 'mocha':
					return await this.runMochaTests(testPattern);
				case 'vitest':
					return await this.runVitestTests(testPattern);
				case 'pytest':
					return await this.runPytestTests(testPattern);
				case 'go-test':
					return await this.runGoTests(testPattern);
				default:
					throw new Error(`Unsupported test framework: ${testFramework}`);
			}
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Test execution failed: ${errMsg}`);
		}
	}

	public async runTestsForFiles(files: string[]): Promise<TestResults> {
		try {
			const testFiles = this.findRelatedTestFiles(files);
			if (testFiles.length === 0) {
				throw new Error('No test files found for the provided files');
			}
			return await this.runTests(testFiles.join(' '));
		} catch (error: unknown) {
			throw new Error(`Failed to run tests for files: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	public async generateTestCoverage(): Promise<number> {
		try {
			const testFramework = await this.detectTestFramework();
			switch (testFramework) {
				case 'jest':
					return await this.getJestCoverage();
				case 'mocha':
					return await this.getMochaCoverage();
				case 'vitest':
					return await this.getVitestCoverage();
				case 'pytest':
					return await this.getPytestCoverage();
				case 'go-test':
					return await this.getGoCoverage();
				default:
					throw new Error(`Unsupported test framework for coverage: ${testFramework}`);
			}
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.warn('Failed to generate test coverage:', errMsg);
			return 0;
		}
	}

	public async validateTestSetup(): Promise<boolean> {
		try {
			const packageJson = await this.loadPackageJson();
			const testFramework = await this.detectTestFramework();

			switch (testFramework) {
				case 'jest':
					return this.validateJestSetup(packageJson);
				case 'mocha':
					return this.validateMochaSetup(packageJson);
				case 'vitest':
					return this.validateVitestSetup(packageJson);
				case 'pytest':
					return this.validatePytestSetup();
				case 'go-test':
					return this.validateGoTestSetup();
				default:
					return false;
			}
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.error('Test setup validation failed:', errMsg);
			return false;
		}
	}

	private async detectTestFramework(): Promise<string> {
		try {
			const packageJson = await this.loadPackageJson();
			if (packageJson) {
				const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
				if (dependencies.jest || packageJson.jest) return 'jest';
				if (dependencies.vitest) return 'vitest';
				if (dependencies.mocha) return 'mocha';
			}
			if (this.validatePytestSetup()) return 'pytest';
			if (this.validateGoTestSetup()) return 'go-test';
			throw new Error('No supported test framework detected');
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to detect test framework: ${errMsg}`);
		}
	}

	private async loadPackageJson(): Promise<any> {
		try {
			const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
			if (fs.existsSync(packageJsonPath)) {
				return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
			}
			return null;
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.warn('Could not load package.json:', errMsg);
			return null;
		}
	}

	private async runJestTests(testPattern?: string): Promise<TestResults> {
		return this.runNodeBasedTests('jest', testPattern, this.parseJestOutput.bind(this));
	}

	private async runMochaTests(testPattern?: string): Promise<TestResults> {
		return this.runNodeBasedTests('mocha', testPattern, this.parseMochaOutput.bind(this));
	}

	private async runVitestTests(testPattern?: string): Promise<TestResults> {
		return this.runNodeBasedTests('vitest', testPattern, this.parseVitestOutput.bind(this));
	}

	private async runPytestTests(testPattern?: string): Promise<TestResults> {
		return this.runCommand('pytest', ['--json-report', testPattern || ''], this.parsePytestOutput.bind(this));
	}

	private async runGoTests(testPattern?: string): Promise<TestResults> {
		return this.runCommand('go', ['test', '-json', testPattern || './...'], this.parseGoTestOutput.bind(this));
	}

	private async runNodeBasedTests(command: string, testPattern: string | undefined, parser: (output: string) => TestResults): Promise<TestResults> {
		const args = testPattern ? [testPattern] : [];
		return this.runCommand(command, args, parser);
	}

	private async runCommand(command: string, args: string[], parser: (output: string) => TestResults): Promise<TestResults> {
		return new Promise((resolve, reject) => {
			let output = '';
			let errorOutput = '';

			const proc = spawn(command, args.filter(arg => arg), { cwd: this.workspaceRoot });

			proc.stdout.on('data', (data) => {
				output += data.toString();
			});

			proc.stderr.on('data', (data) => {
				errorOutput += data.toString();
			});

			proc.on('close', () => {
				try {
					const result = parser(output);
					resolve(result);
				} catch (error: unknown) {
					const errMsg = error instanceof Error ? error.message : String(error);
					reject(new Error(`${command} output parsing failed: ${errMsg}\nOutput: ${output}\nError: ${errorOutput}`));
				}
			});

			proc.on('error', (error) => {
				const errMsg = error instanceof Error ? error.message : String(error);
				reject(new Error(`${command} execution failed: ${errMsg}`));
			});
		});
	}

	private parseJestOutput(output: string): TestResults {
		try {
			const jsonOutput = JSON.parse(output);
			const failures: TestFailure[] = [];

			if (jsonOutput.testResults) {
				jsonOutput.testResults.forEach((fileResult: any) => {
					fileResult.assertionResults.forEach((test: any) => {
						if (test.status === 'failed') {
							failures.push({
								testName: test.fullName,
								error: test.failureMessages?.join('\n') || 'Test failed',
								stackTrace: test.failureMessages?.join('\n')
							});
						}
					});
				});
			}

			return {
				passed: jsonOutput.numPassedTests || 0,
				failed: jsonOutput.numFailedTests || 0,
				skipped: jsonOutput.numPendingTests || 0,
				coverage: jsonOutput.coverageMap ? this.calculateJestCoverage(jsonOutput.coverageMap) : undefined,
				failures,
				duration: jsonOutput.runTime || 0,
				success: (jsonOutput.numFailedTests || 0) === 0,
				testResults: jsonOutput.testResults || []
			};
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to parse Jest output: ${errMsg}`);
		}
	}

	private parseMochaOutput(output: string): TestResults {
		try {
			const lines = output.split('\n').filter(line => line.trim());
			const jsonLine = lines.find(line => line.startsWith('{'));

			if (!jsonLine) {
				throw new Error('No JSON output found in Mocha output');
			}

			const jsonOutput = JSON.parse(jsonLine);
			const failures: TestFailure[] = [];

			if (jsonOutput.tests) {
				jsonOutput.tests.forEach((test: any) => {
					if (test.err) {
						failures.push({
							testName: test.fullTitle,
							error: test.err.message || 'Test failed',
							stackTrace: test.err.stack
						});
					}
				});
			}

			return {
				passed: jsonOutput.stats?.passes || 0,
				failed: jsonOutput.stats?.failures || 0,
				skipped: jsonOutput.stats?.pending || 0,
				failures,
				duration: jsonOutput.stats?.duration || 0,
				success: (jsonOutput.stats?.failures || 0) === 0,
				testResults: jsonOutput.tests || []
			};
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to parse Mocha output: ${errMsg}`);
		}
	}

	private parseVitestOutput(output: string): TestResults {
		try {
			const lines = output.split('\n').filter(line => line.trim());
			const jsonLine = lines.find(line => line.startsWith('{'));

			if (!jsonLine) {
				throw new Error('No JSON output found in Vitest output');
			}

			const jsonOutput = JSON.parse(jsonLine);
			const failures: TestFailure[] = [];

			if (jsonOutput.testResults) {
				Object.values(jsonOutput.testResults).forEach((fileResult: any) => {
					fileResult.forEach((test: any) => {
						if (test.state === 'fail') {
							failures.push({
								testName: test.name,
								error: test.errors?.[0]?.message || 'Test failed',
								stackTrace: test.errors?.[0]?.stack
							});
						}
					});
				});
			}

			return {
				passed: jsonOutput.numPassedTests || 0,
				failed: jsonOutput.numFailedTests || 0,
				skipped: jsonOutput.numPendingTests || 0,
				failures,
				duration: jsonOutput.duration || 0,
				success: (jsonOutput.numFailedTests || 0) === 0,
				testResults: jsonOutput.testResults || []
			};
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to parse Vitest output: ${errMsg}`);
		}
	}

	private parsePytestOutput(output: string): TestResults {
		try {
			const reportPath = path.join(this.workspaceRoot, '.report.json');
			let jsonOutput;

			if (fs.existsSync(reportPath)) {
				jsonOutput = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
			} else {
				const jsonMatch = output.match(/\{.*\}/s);
				if (!jsonMatch) {
					throw new Error('No JSON output found in Pytest output');
				}
				jsonOutput = JSON.parse(jsonMatch[0]);
			}

			const failures: TestFailure[] = jsonOutput.tests
				?.filter((test: any) => test.outcome === 'failed')
				?.map((test: any) => ({
					testName: test.nodeid,
					error: test.call?.longrepr || 'Test failed',
					stackTrace: test.call?.longrepr
				})) || [];

			// Synchronous coverage (may be undefined)
			let coverage: number | undefined = undefined;
			try {
				const coveragePath = path.join(this.workspaceRoot, 'coverage.json');
				if (fs.existsSync(coveragePath)) {
					const coverageObj = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
					coverage = coverageObj.totals?.percent_covered || 0;
				}
			} catch { }

			return {
				passed: jsonOutput.summary?.passed || 0,
				failed: jsonOutput.summary?.failed || 0,
				skipped: jsonOutput.summary?.skipped || 0,
				coverage,
				failures,
				duration: jsonOutput.duration || 0,
				success: (jsonOutput.summary?.failed || 0) === 0,
				testResults: jsonOutput.tests || []
			};
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to parse Pytest output: ${errMsg}`);
		}
	}

	private parseGoTestOutput(output: string): TestResults {
		try {
			const lines = output.split('\n').filter(line => line.trim());
			let passed = 0;
			let failed = 0;
			let skipped = 0;
			const failures: TestFailure[] = [];
			let total = 0;

			lines.forEach(line => {
				try {
					const event = JSON.parse(line);
					if (event.Action === 'pass' && event.Test) {
						passed++;
						total++;
					} else if (event.Action === 'fail' && event.Test) {
						failed++;
						total++;
						failures.push({
							testName: event.Test,
							error: event.Output || 'Test failed',
							stackTrace: event.Output
						});
					} else if (event.Action === 'skip' && event.Test) {
						skipped++;
						total++;
					}
				} catch {
					// Ignore non-JSON lines
				}
			});

			return {
				passed,
				failed,
				skipped,
				failures,
				duration: 0, // Go test doesn't provide total duration in JSON format
				success: failed === 0,
				testResults: { passed, failed, total }
			};
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to parse Go test output: ${errMsg}`);
		}
	}

	private calculateJestCoverage(coverageMap: any): number {
		try {
			let totalLines = 0;
			let coveredLines = 0;

			Object.values(coverageMap).forEach((fileInfo: any) => {
				const statements = fileInfo.s || {};
				Object.values(statements).forEach((count: any) => {
					totalLines++;
					if (count > 0) {
						coveredLines++;
					}
				});
			});

			return totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0;
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.warn('Could not calculate Jest coverage:', errMsg);
			return 0;
		}
	}

	private async getJestCoverage(): Promise<number> {
		const coveragePath = path.join(this.workspaceRoot, 'coverage', 'coverage-summary.json');
		try {
			if (fs.existsSync(coveragePath)) {
				const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
				return coverage.total?.lines?.pct || 0;
			}
			return 0;
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.warn('Could not read Jest coverage:', errMsg);
			return 0;
		}
	}

	private async getMochaCoverage(): Promise<number> {
		const coveragePath = path.join(this.workspaceRoot, 'coverage', 'coverage-summary.json');
		try {
			if (fs.existsSync(coveragePath)) {
				const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
				return coverage.total?.lines?.pct || 0;
			}
			return 0;
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.warn('Could not read Mocha coverage:', errMsg);
			return 0;
		}
	}

	private async getVitestCoverage(): Promise<number> {
		const coveragePath = path.join(this.workspaceRoot, 'coverage', 'coverage-summary.json');
		try {
			if (fs.existsSync(coveragePath)) {
				const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
				return coverage.total?.lines?.pct || 0;
			}
			return 0;
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.warn('Could not read Vitest coverage:', errMsg);
			return 0;
		}
	}
	private async getPytestCoverage(): Promise<number> {
		const coveragePath = path.join(this.workspaceRoot, 'coverage.json');
		try {
			if (fs.existsSync(coveragePath)) {
				const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
				return coverage.totals?.percent_covered || 0;
			}
			return 0;
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : 'Unknown error';
			console.warn('Could not read Pytest coverage:', errMsg);
			return 0;
		}
	}

	private async getGoCoverage(): Promise<number> {
		// Placeholder for Go coverage implementation
		return 0;
	}

	private findRelatedTestFiles(files: string[]): string[] {
		const testFiles: string[] = [];

		files.forEach(file => {
			const basename = path.basename(file, path.extname(file));
			const dirname = path.dirname(file);

			const testPatterns = [
				`${basename}.test.*`,
				`${basename}.spec.*`,
				`${basename}_test.*`,
				`test_${basename}.*`
			];

			testPatterns.forEach(pattern => {
				try {
					const matches = fs.readdirSync(dirname).filter(f => new RegExp(pattern.replace('*', '.*')).test(f));
					matches.forEach(match => {
						const testFile = path.join(dirname, match);
						if (fs.existsSync(testFile)) {
							testFiles.push(testFile);
						}
					});
				} catch (error) {
					const errMsg = error instanceof Error ? error.message : String(error);
					console.warn(`Could not read directory ${dirname}: ${errMsg}`);
				}
			});
		});

		return testFiles;
	}

	private validateJestSetup(packageJson: any): boolean {
		return !!(packageJson?.dependencies?.jest || packageJson?.devDependencies?.jest || packageJson?.jest);
	}

	private validateMochaSetup(packageJson: any): boolean {
		return !!(packageJson?.dependencies?.mocha || packageJson?.devDependencies?.mocha);
	}

	private validateVitestSetup(packageJson: any): boolean {
		return !!(packageJson?.dependencies?.vitest || packageJson?.devDependencies?.vitest);
	}

	private validatePytestSetup(): boolean {
		return (
			fs.existsSync(path.join(this.workspaceRoot, 'requirements.txt')) ||
			fs.existsSync(path.join(this.workspaceRoot, 'setup.py')) ||
			fs.existsSync(path.join(this.workspaceRoot, 'pyproject.toml'))
		);
	}

	private validateGoTestSetup(): boolean {
		return fs.existsSync(path.join(this.workspaceRoot, 'go.mod'));
	}
}
