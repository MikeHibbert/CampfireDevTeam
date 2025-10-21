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
const assert = __importStar(require("assert"));
const backendRequestHandler_1 = require("../../managers/backendRequestHandler");
suite('BackendRequestHandler Test Suite', () => {
    let requestHandler;
    setup(() => {
        requestHandler = new backendRequestHandler_1.BackendRequestHandler();
    });
    test('Should validate backend requests for security', () => {
        const validRequest = {
            action: 'list_directory',
            parameters: { path: '/workspace/src' },
            target_path: '/workspace/src'
        };
        const invalidRequest = {
            action: 'list_directory',
            parameters: { path: '/etc/passwd' },
            target_path: '/etc/passwd'
        };
        const isValid = requestHandler.validateRequest(validRequest, '/workspace');
        const isInvalid = requestHandler.validateRequest(invalidRequest, '/workspace');
        assert.strictEqual(isValid, true);
        assert.strictEqual(isInvalid, false);
    });
    test('Should handle directory listing requests', () => {
        const request = {
            action: 'list_directory',
            parameters: { path: '/workspace/src' },
            target_path: '/workspace/src'
        };
        const response = requestHandler.handleDirectoryListing(request);
        assert.ok(response.files);
        assert.ok(Array.isArray(response.files));
    });
    test('Should handle code section requests', () => {
        const request = {
            action: 'get_code_section',
            parameters: {
                file_path: '/workspace/src/test.py',
                start_line: 1,
                end_line: 10
            },
            target_path: '/workspace/src/test.py'
        };
        const response = requestHandler.handleCodeSectionRequest(request);
        assert.ok(response.hasOwnProperty('content'));
        assert.ok(response.hasOwnProperty('line_count'));
    });
    test('Should handle code update requests', () => {
        const request = {
            action: 'update_code',
            parameters: {
                file_path: '/workspace/src/test.py',
                content: 'def hello(): print("Hello World")',
                operation: 'replace'
            },
            target_path: '/workspace/src/test.py'
        };
        const response = requestHandler.handleCodeUpdate(request);
        assert.strictEqual(response.success, true);
        assert.ok(response.message);
    });
    test('Should provide confirmation responses', () => {
        const action = 'update_code';
        const success = true;
        const details = { files_modified: 1 };
        const confirmation = requestHandler.createConfirmationResponse(action, success, details);
        assert.strictEqual(confirmation.action, action);
        assert.strictEqual(confirmation.success, success);
        assert.deepStrictEqual(confirmation.details, details);
        assert.ok(confirmation.timestamp);
    });
});
//# sourceMappingURL=backendRequestHandler.test.js.map