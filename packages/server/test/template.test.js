"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const template_1 = require("../src/template");
const fakeDb = {
    raw: {
        prepare() {
            return {
                all() {
                    return [];
                },
            };
        },
    },
    init() { },
};
(0, node_test_1.default)("resolves now token inside json string", () => {
    const result = (0, template_1.resolveTemplatePayload)(fakeDb, '{"publishDate":"{{now}}"}');
    strict_1.default.equal(typeof result.text, "string");
    strict_1.default.equal(typeof result.value, "object");
    const payload = result.value;
    strict_1.default.equal(typeof payload.publishDate, "string");
});
(0, node_test_1.default)("resolves env token", () => {
    const result = (0, template_1.resolveTemplatePayload)(fakeDb, '{"name":"{{env.NAME}}"}', undefined, { NAME: "mqtt" });
    const payload = result.value;
    strict_1.default.equal(payload.name, "mqtt");
});
