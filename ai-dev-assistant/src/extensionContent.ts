import * as vscode from 'vscode';

// --- BEGIN MINIMAL WORKING EXTENSION ENTRY ---
// Remove all broken code and keep only a minimal, working extension entry point

let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	// TODO: Re-add your extension logic here, step by step, ensuring type safety and correctness.
}

export function getExtensionContext(): vscode.ExtensionContext {
	return extensionContext;
}
// --- END MINIMAL WORKING EXTENSION ENTRY ---
