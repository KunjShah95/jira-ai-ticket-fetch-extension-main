"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtensionContext = exports.activate = void 0;
// --- BEGIN MINIMAL WORKING EXTENSION ENTRY ---
// Remove all broken code and keep only a minimal, working extension entry point
let extensionContext;
function activate(context) {
    extensionContext = context;
    // TODO: Re-add your extension logic here, step by step, ensuring type safety and correctness.
}
exports.activate = activate;
function getExtensionContext() {
    return extensionContext;
}
exports.getExtensionContext = getExtensionContext;
// --- END MINIMAL WORKING EXTENSION ENTRY ---
//# sourceMappingURL=extensionContent.js.map