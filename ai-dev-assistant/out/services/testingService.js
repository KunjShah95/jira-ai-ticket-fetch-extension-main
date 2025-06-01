"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestingService = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class TestingService {
    constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        this.workspaceRoot = workspaceFolder.uri.fsPath;
    }
    async runTests(testPattern) {
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
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Test execution failed: ${errMsg}`);
        }
    }
    async runTestsForFiles(files) {
        try {
            const testFiles = this.findRelatedTestFiles(files);
            if (testFiles.length === 0) {
                throw new Error('No test files found for the provided files');
            }
            return await this.runTests(testFiles.join(' '));
        }
        catch (error) {
            throw new Error(`Failed to run tests for files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async generateTestCoverage() {
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
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn('Failed to generate test coverage:', errMsg);
            return 0;
        }
    }
    async validateTestSetup() {
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
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error('Test setup validation failed:', errMsg);
            return false;
        }
    }
    async detectTestFramework() {
        try {
            const packageJson = await this.loadPackageJson();
            if (packageJson) {
                const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
                if (dependencies.jest || packageJson.jest)
                    return 'jest';
                if (dependencies.vitest)
                    return 'vitest';
                if (dependencies.mocha)
                    return 'mocha';
            }
            if (this.validatePytestSetup())
                return 'pytest';
            if (this.validateGoTestSetup())
                return 'go-test';
            throw new Error('No supported test framework detected');
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to detect test framework: ${errMsg}`);
        }
    }
    async loadPackageJson() {
        try {
            const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            }
            return null;
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn('Could not load package.json:', errMsg);
            return null;
        }
    }
    async runJestTests(testPattern) {
        return this.runNodeBasedTests('jest', testPattern, this.parseJestOutput.bind(this));
    }
    async runMochaTests(testPattern) {
        return this.runNodeBasedTests('mocha', testPattern, this.parseMochaOutput.bind(this));
    }
    async runVitestTests(testPattern) {
        return this.runNodeBasedTests('vitest', testPattern, this.parseVitestOutput.bind(this));
    }
    async runPytestTests(testPattern) {
        return this.runCommand('pytest', ['--json-report', testPattern || ''], this.parsePytestOutput.bind(this));
    }
    async runGoTests(testPattern) {
        return this.runCommand('go', ['test', '-json', testPattern || './...'], this.parseGoTestOutput.bind(this));
    }
    async runNodeBasedTests(command, testPattern, parser) {
        const args = testPattern ? [testPattern] : [];
        return this.runCommand(command, args, parser);
    }
    async runCommand(command, args, parser) {
        return new Promise((resolve, reject) => {
            let output = '';
            let errorOutput = '';
            const proc = (0, child_process_1.spawn)(command, args.filter(arg => arg), { cwd: this.workspaceRoot });
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
                }
                catch (error) {
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
    parseJestOutput(output) {
        try {
            const jsonOutput = JSON.parse(output);
            const failures = [];
            if (jsonOutput.testResults) {
                jsonOutput.testResults.forEach((fileResult) => {
                    fileResult.assertionResults.forEach((test) => {
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
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse Jest output: ${errMsg}`);
        }
    }
    parseMochaOutput(output) {
        try {
            const lines = output.split('\n').filter(line => line.trim());
            const jsonLine = lines.find(line => line.startsWith('{'));
            if (!jsonLine) {
                throw new Error('No JSON output found in Mocha output');
            }
            const jsonOutput = JSON.parse(jsonLine);
            const failures = [];
            if (jsonOutput.tests) {
                jsonOutput.tests.forEach((test) => {
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
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse Mocha output: ${errMsg}`);
        }
    }
    parseVitestOutput(output) {
        try {
            const lines = output.split('\n').filter(line => line.trim());
            const jsonLine = lines.find(line => line.startsWith('{'));
            if (!jsonLine) {
                throw new Error('No JSON output found in Vitest output');
            }
            const jsonOutput = JSON.parse(jsonLine);
            const failures = [];
            if (jsonOutput.testResults) {
                Object.values(jsonOutput.testResults).forEach((fileResult) => {
                    fileResult.forEach((test) => {
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
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse Vitest output: ${errMsg}`);
        }
    }
    parsePytestOutput(output) {
        try {
            const reportPath = path.join(this.workspaceRoot, '.report.json');
            let jsonOutput;
            if (fs.existsSync(reportPath)) {
                jsonOutput = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            }
            else {
                const jsonMatch = output.match(/\{.*\}/s);
                if (!jsonMatch) {
                    throw new Error('No JSON output found in Pytest output');
                }
                jsonOutput = JSON.parse(jsonMatch[0]);
            }
            const failures = jsonOutput.tests
                ?.filter((test) => test.outcome === 'failed')
                ?.map((test) => ({
                testName: test.nodeid,
                error: test.call?.longrepr || 'Test failed',
                stackTrace: test.call?.longrepr
            })) || [];
            // Synchronous coverage (may be undefined)
            let coverage = undefined;
            try {
                const coveragePath = path.join(this.workspaceRoot, 'coverage.json');
                if (fs.existsSync(coveragePath)) {
                    const coverageObj = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                    coverage = coverageObj.totals?.percent_covered || 0;
                }
            }
            catch { }
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
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to parse Pytest output: ${errMsg}`);
        }
    }
    parseGoTestOutput(output) {
        try {
            const lines = output.split('\n').filter(line => line.trim());
            let passed = 0;
            let failed = 0;
            let skipped = 0;
            const failures = [];
            let total = 0;
            lines.forEach(line => {
                try {
                    const event = JSON.parse(line);
                    if (event.Action === 'pass' && event.Test) {
                        passed++;
                        total++;
                    }
                    else if (event.Action === 'fail' && event.Test) {
                        failed++;
                        total++;
                        failures.push({
                            testName: event.Test,
                            error: event.Output || 'Test failed',
                            stackTrace: event.Output
                        });
                    }
                    else if (event.Action === 'skip' && event.Test) {
                        skipped++;
                        total++;
                    }
                }
                catch {
                    // Ignore non-JSON lines
                }
            });
            return {
                passed,
                failed,
                skipped,
                failures,
                duration: 0,
                success: failed === 0,
                testResults: { passed, failed, total }
            };
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse Go test output: ${errMsg}`);
        }
    }
    calculateJestCoverage(coverageMap) {
        try {
            let totalLines = 0;
            let coveredLines = 0;
            Object.values(coverageMap).forEach((fileInfo) => {
                const statements = fileInfo.s || {};
                Object.values(statements).forEach((count) => {
                    totalLines++;
                    if (count > 0) {
                        coveredLines++;
                    }
                });
            });
            return totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0;
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn('Could not calculate Jest coverage:', errMsg);
            return 0;
        }
    }
    async getJestCoverage() {
        const coveragePath = path.join(this.workspaceRoot, 'coverage', 'coverage-summary.json');
        try {
            if (fs.existsSync(coveragePath)) {
                const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                return coverage.total?.lines?.pct || 0;
            }
            return 0;
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn('Could not read Jest coverage:', errMsg);
            return 0;
        }
    }
    async getMochaCoverage() {
        const coveragePath = path.join(this.workspaceRoot, 'coverage', 'coverage-summary.json');
        try {
            if (fs.existsSync(coveragePath)) {
                const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                return coverage.total?.lines?.pct || 0;
            }
            return 0;
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn('Could not read Mocha coverage:', errMsg);
            return 0;
        }
    }
    async getVitestCoverage() {
        const coveragePath = path.join(this.workspaceRoot, 'coverage', 'coverage-summary.json');
        try {
            if (fs.existsSync(coveragePath)) {
                const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                return coverage.total?.lines?.pct || 0;
            }
            return 0;
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn('Could not read Vitest coverage:', errMsg);
            return 0;
        }
    }
    async getPytestCoverage() {
        const coveragePath = path.join(this.workspaceRoot, 'coverage.json');
        try {
            if (fs.existsSync(coveragePath)) {
                const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                return coverage.totals?.percent_covered || 0;
            }
            return 0;
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            console.warn('Could not read Pytest coverage:', errMsg);
            return 0;
        }
    }
    async getGoCoverage() {
        // Placeholder for Go coverage implementation
        return 0;
    }
    findRelatedTestFiles(files) {
        const testFiles = [];
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
                }
                catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    console.warn(`Could not read directory ${dirname}: ${errMsg}`);
                }
            });
        });
        return testFiles;
    }
    validateJestSetup(packageJson) {
        return !!(packageJson?.dependencies?.jest || packageJson?.devDependencies?.jest || packageJson?.jest);
    }
    validateMochaSetup(packageJson) {
        return !!(packageJson?.dependencies?.mocha || packageJson?.devDependencies?.mocha);
    }
    validateVitestSetup(packageJson) {
        return !!(packageJson?.dependencies?.vitest || packageJson?.devDependencies?.vitest);
    }
    validatePytestSetup() {
        return (fs.existsSync(path.join(this.workspaceRoot, 'requirements.txt')) ||
            fs.existsSync(path.join(this.workspaceRoot, 'setup.py')) ||
            fs.existsSync(path.join(this.workspaceRoot, 'pyproject.toml')));
    }
    validateGoTestSetup() {
        return fs.existsSync(path.join(this.workspaceRoot, 'go.mod'));
    }
}
exports.TestingService = TestingService;
//# sourceMappingURL=testingService.js.map