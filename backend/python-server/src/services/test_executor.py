import asyncio
import subprocess
import os
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
from loguru import logger

from src.models.schemas import TestResult


class TestExecutor:
    """Service for executing generated tests"""

    def __init__(self):
        self.timeout_seconds = 60  # Default timeout for test execution

    async def run_tests(
        self, workspace_path: str, test_file_path: str, test_framework: str
    ) -> TestResult:
        """Run tests for a specific test file"""

        logger.info(f"Running tests for {test_file_path} using {test_framework}")

        start_time = time.time()

        try:
            if test_framework.lower() == "jest":
                result = await self._run_jest_tests(workspace_path, test_file_path)
            elif test_framework.lower() == "pytest":
                result = await self._run_pytest_tests(workspace_path, test_file_path)
            elif test_framework.lower() == "vitest":
                result = await self._run_vitest_tests(workspace_path, test_file_path)
            else:
                # Generic test runner
                result = await self._run_generic_tests(
                    workspace_path, test_file_path, test_framework
                )

            execution_time = time.time() - start_time
            result.execution_time = execution_time

            logger.info(
                f"Test execution completed: {result.passed_tests}/{result.total_tests} passed"
            )
            return result

        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Test execution failed: {str(e)}")

            return TestResult(
                test_file=test_file_path,
                passed=False,
                total_tests=0,
                passed_tests=0,
                failed_tests=0,
                execution_time=execution_time,
                output=f"Test execution failed: {str(e)}",
                errors=[str(e)],
            )

    async def _run_jest_tests(
        self, workspace_path: str, test_file_path: str
    ) -> TestResult:
        """Run Jest tests"""

        # First check if Jest is available
        await self._ensure_jest_setup(workspace_path)

        cmd = ["npx", "jest", test_file_path, "--json", "--no-cache", "--silent"]

        result = await self._execute_command(cmd, workspace_path)

        return self._parse_jest_output(test_file_path, result)

    async def _run_pytest_tests(
        self, workspace_path: str, test_file_path: str
    ) -> TestResult:
        """Run pytest tests"""

        cmd = [
            "python",
            "-m",
            "pytest",
            test_file_path,
            "-v",
            "--json-report",
            "--json-report-file=test_results.json",
        ]

        result = await self._execute_command(cmd, workspace_path)

        return self._parse_pytest_output(test_file_path, result, workspace_path)

    async def _run_vitest_tests(
        self, workspace_path: str, test_file_path: str
    ) -> TestResult:
        """Run Vitest tests"""

        await self._ensure_vitest_setup(workspace_path)

        cmd = ["npx", "vitest", "run", test_file_path, "--reporter=json"]

        result = await self._execute_command(cmd, workspace_path)

        return self._parse_vitest_output(test_file_path, result)

    async def _run_generic_tests(
        self, workspace_path: str, test_file_path: str, framework: str
    ) -> TestResult:
        """Run tests with a generic approach"""

        logger.warning(f"Using generic test runner for {framework}")

        # Try to detect the appropriate command based on file extension
        file_path = Path(test_file_path)

        if file_path.suffix == ".py":
            cmd = ["python", test_file_path]
        elif file_path.suffix in [".js", ".ts"]:
            cmd = ["node", test_file_path]
        else:
            raise ValueError(f"Unsupported test file type: {file_path.suffix}")

        result = await self._execute_command(cmd, workspace_path)

        # Generic parsing - just check if command succeeded
        passed = result["returncode"] == 0

        return TestResult(
            test_file=test_file_path,
            passed=passed,
            total_tests=1,  # Generic assumption
            passed_tests=1 if passed else 0,
            failed_tests=0 if passed else 1,
            execution_time=0,  # Will be set by caller
            output=result["stdout"] + result["stderr"],
            errors=[result["stderr"]] if result["stderr"] else [],
        )

    async def _execute_command(self, cmd: List[str], cwd: str) -> Dict[str, Any]:
        """Execute a command and return result"""

        logger.debug(f"Executing command: {' '.join(cmd)} in {cwd}")

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=self.timeout_seconds
            )

            return {
                "returncode": process.returncode,
                "stdout": stdout.decode("utf-8") if stdout else "",
                "stderr": stderr.decode("utf-8") if stderr else "",
            }

        except asyncio.TimeoutError:
            logger.error(f"Command timed out after {self.timeout_seconds} seconds")
            raise
        except Exception as e:
            logger.error(f"Command execution failed: {str(e)}")
            raise

    def _parse_jest_output(
        self, test_file_path: str, result: Dict[str, Any]
    ) -> TestResult:
        """Parse Jest JSON output"""

        try:
            import json

            if result["returncode"] == 0 and result["stdout"]:
                jest_result = json.loads(result["stdout"])

                total_tests = jest_result.get("numTotalTests", 0)
                passed_tests = jest_result.get("numPassedTests", 0)
                failed_tests = jest_result.get("numFailedTests", 0)

                return TestResult(
                    test_file=test_file_path,
                    passed=failed_tests == 0,
                    total_tests=total_tests,
                    passed_tests=passed_tests,
                    failed_tests=failed_tests,
                    execution_time=0,  # Will be set by caller
                    output=result["stdout"],
                    errors=self._extract_jest_errors(jest_result),
                )
            else:
                # Parse from stderr if JSON parsing fails
                return self._parse_text_output(test_file_path, result)

        except json.JSONDecodeError:
            logger.warning(
                "Failed to parse Jest JSON output, falling back to text parsing"
            )
            return self._parse_text_output(test_file_path, result)

    def _parse_pytest_output(
        self, test_file_path: str, result: Dict[str, Any], workspace_path: str
    ) -> TestResult:
        """Parse pytest output"""

        try:
            import json

            # Try to read JSON report file
            json_report_path = Path(workspace_path) / "test_results.json"
            if json_report_path.exists():
                pytest_result = json.loads(json_report_path.read_text())

                summary = pytest_result.get("summary", {})
                total_tests = summary.get("total", 0)
                passed_tests = summary.get("passed", 0)
                failed_tests = summary.get("failed", 0)

                return TestResult(
                    test_file=test_file_path,
                    passed=failed_tests == 0,
                    total_tests=total_tests,
                    passed_tests=passed_tests,
                    failed_tests=failed_tests,
                    execution_time=0,  # Will be set by caller
                    output=result["stdout"],
                    errors=self._extract_pytest_errors(pytest_result),
                )
            else:
                return self._parse_text_output(test_file_path, result)

        except Exception:
            logger.warning(
                "Failed to parse pytest JSON output, falling back to text parsing"
            )
            return self._parse_text_output(test_file_path, result)

    def _parse_vitest_output(
        self, test_file_path: str, result: Dict[str, Any]
    ) -> TestResult:
        """Parse Vitest JSON output"""

        try:
            import json

            if result["stdout"]:
                vitest_result = json.loads(result["stdout"])

                # Vitest JSON structure may vary, adapt as needed
                test_results = vitest_result.get("testResults", [])

                total_tests = sum(
                    len(tr.get("assertionResults", [])) for tr in test_results
                )
                passed_tests = sum(
                    len(
                        [
                            a
                            for a in tr.get("assertionResults", [])
                            if a.get("status") == "passed"
                        ]
                    )
                    for tr in test_results
                )
                failed_tests = total_tests - passed_tests

                return TestResult(
                    test_file=test_file_path,
                    passed=failed_tests == 0,
                    total_tests=total_tests,
                    passed_tests=passed_tests,
                    failed_tests=failed_tests,
                    execution_time=0,  # Will be set by caller
                    output=result["stdout"],
                    errors=[],
                )
            else:
                return self._parse_text_output(test_file_path, result)

        except json.JSONDecodeError:
            logger.warning(
                "Failed to parse Vitest JSON output, falling back to text parsing"
            )
            return self._parse_text_output(test_file_path, result)

    def _parse_text_output(
        self, test_file_path: str, result: Dict[str, Any]
    ) -> TestResult:
        """Fallback text parsing for test output"""

        output = result["stdout"] + result["stderr"]
        passed = result["returncode"] == 0

        # Try to extract basic test counts from text
        total_tests = 1  # Default assumption
        passed_tests = 1 if passed else 0
        failed_tests = 0 if passed else 1

        # Look for common test result patterns
        import re

        # Jest/Vitest patterns
        jest_pattern = r"(\d+) passed.*?(\d+) total"
        jest_match = re.search(jest_pattern, output)
        if jest_match:
            passed_tests = int(jest_match.group(1))
            total_tests = int(jest_match.group(2))
            failed_tests = total_tests - passed_tests

        # Pytest patterns
        pytest_pattern = r"(\d+) passed.*?(\d+) failed"
        pytest_match = re.search(pytest_pattern, output)
        if pytest_match:
            passed_tests = int(pytest_match.group(1))
            failed_tests = int(pytest_match.group(2))
            total_tests = passed_tests + failed_tests

        return TestResult(
            test_file=test_file_path,
            passed=passed,
            total_tests=total_tests,
            passed_tests=passed_tests,
            failed_tests=failed_tests,
            execution_time=0,  # Will be set by caller
            output=output,
            errors=[result["stderr"]] if result["stderr"] else [],
        )

    def _extract_jest_errors(self, jest_result: Dict[str, Any]) -> List[str]:
        """Extract error messages from Jest result"""
        errors = []

        test_results = jest_result.get("testResults", [])
        for test_result in test_results:
            assertion_results = test_result.get("assertionResults", [])
            for assertion in assertion_results:
                if assertion.get("status") == "failed":
                    failure_messages = assertion.get("failureMessages", [])
                    errors.extend(failure_messages)

        return errors

    def _extract_pytest_errors(self, pytest_result: Dict[str, Any]) -> List[str]:
        """Extract error messages from pytest result"""
        errors = []

        tests = pytest_result.get("tests", [])
        for test in tests:
            if test.get("outcome") == "failed":
                call = test.get("call", {})
                if "longrepr" in call:
                    errors.append(call["longrepr"])

        return errors

    async def _ensure_jest_setup(self, workspace_path: str):
        """Ensure Jest is set up in the workspace"""

        package_json_path = Path(workspace_path) / "package.json"

        if not package_json_path.exists():
            logger.warning("package.json not found, Jest may not work properly")
            return

        # Check if node_modules exists, if not try to install
        node_modules_path = Path(workspace_path) / "node_modules"
        if not node_modules_path.exists():
            logger.info("Installing npm dependencies...")
            try:
                await self._execute_command(["npm", "install"], workspace_path)
            except Exception as e:
                logger.warning(f"Failed to install npm dependencies: {str(e)}")

    async def _ensure_vitest_setup(self, workspace_path: str):
        """Ensure Vitest is set up in the workspace"""

        package_json_path = Path(workspace_path) / "package.json"

        if not package_json_path.exists():
            logger.warning("package.json not found, Vitest may not work properly")
            return

        # Similar to Jest setup
        await self._ensure_jest_setup(workspace_path)
