"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordTraffic = exports.resolveOutputDir = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config");
const FALLBACK_OUTPUT_DIR = 'captured-mocks';
let config;
/** Mounts configuration object by reading consumer asmr.config.js (if any) and
 * merge it with default configuration. Fallsback to ASMR config if error.
 */
const candidate = node_path_1.default.join(process.cwd(), 'asmr.config.js');
try {
    const rawConsumerConfig = require(candidate);
    const consumerConfig = rawConsumerConfig &&
        typeof rawConsumerConfig === 'object' &&
        'default' in rawConsumerConfig &&
        rawConsumerConfig.default &&
        typeof rawConsumerConfig.default === 'object'
        ? rawConsumerConfig.default
        : rawConsumerConfig;
    config = { ...config_1.config, ...consumerConfig };
}
catch {
    config = config_1.config;
}
const CONFIG_OUTPUT_DIR = config.outputDir ||
    config.output ||
    config_1.config.outputDir ||
    config_1.config.output ||
    FALLBACK_OUTPUT_DIR;
const SAME_AS_PREVIOUS_RESPONSE = 'Same as previous';
const SENSITIVE_KEYS = config.sanitize ?? [];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_RE = /^[0-9a-f]{16,}$/i;
function splitPath(path) {
    return path.split('.').filter(Boolean);
}
function setByPath(root, path, mode) {
    const parts = splitPath(path);
    if (parts.length === 0)
        return;
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!node || typeof node !== 'object')
            return;
        node = node[parts[i]];
    }
    if (!node || typeof node !== 'object')
        return;
    const parent = node;
    const key = parts[parts.length - 1];
    if (!(key in parent))
        return;
    if (mode === 'hide')
        delete parent[key];
    else
        parent[key] = '***';
}
const tryParseBuffer = (rawBody) => {
    if (!rawBody || rawBody.length === 0) {
        return null;
    }
    const asText = Buffer.from(rawBody).toString('utf-8');
    try {
        return JSON.parse(asText);
    }
    catch {
        return asText;
    }
};
// const sanitizeObject = (value: unknown): unknown => {
//   if (Array.isArray(value)) {
//     return value.map(sanitizeObject);
//   }
//   if (value && typeof value === 'object') {
//     return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, entry]) => {
//       const normalized = key.toLowerCase().replace(/[-_]/g, '');
//       if (SENSITIVE_KEYS.has(normalized)) {
//         acc[key] = '***';
//         return acc;
//       }
//       acc[key] = sanitizeObject(entry);
//       return acc;
//     }, {});
//   }
//   return value;
// };
const normalizePathSegment = (segment) => {
    if (!segment) {
        return segment;
    }
    if (/^\d+$/.test(segment) || UUID_RE.test(segment) || LONG_HEX_RE.test(segment)) {
        return '[id]';
    }
    return segment.toLowerCase().replace(/[^a-z0-9-]/g, '-');
};
const buildOutputFilePath = (outputRoot, proxyName, method, endpoint) => {
    const safeProxyName = proxyName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    const normalizedPath = endpoint
        .split('/')
        .filter(Boolean)
        .map(normalizePathSegment)
        .join('__');
    const safePath = normalizedPath || 'root';
    const fileName = `${method.toUpperCase()}__${safePath}.json`;
    return node_path_1.default.join(outputRoot, safeProxyName || 'proxy', fileName);
};
const readExistingEntries = async (filePath) => {
    try {
        const content = await (0, promises_1.readFile)(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const getLastConcreteResponse = (entries) => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const responseData = entries[index].response.data;
        if (responseData !== SAME_AS_PREVIOUS_RESPONSE) {
            return responseData;
        }
    }
    return undefined;
};
const isSameResponse = (current, previous) => {
    if (typeof previous === 'undefined') {
        return false;
    }
    return JSON.stringify(current) === JSON.stringify(previous);
};
const resolveOutputDir = (outputDirFromCli) => outputDirFromCli || CONFIG_OUTPUT_DIR;
exports.resolveOutputDir = resolveOutputDir;
const recordTraffic = async (input) => {
    const outputDirFromCli = input.outputDir || input.outputRoot;
    const outputRoot = node_path_1.default.resolve(process.cwd(), (0, exports.resolveOutputDir)(outputDirFromCli));
    const filePath = buildOutputFilePath(outputRoot, input.proxyName, input.method, input.endpoint);
    const existingEntries = await readExistingEntries(filePath);
    const previousResponse = getLastConcreteResponse(existingEntries);
    const directory = node_path_1.default.dirname(filePath);
    await (0, promises_1.mkdir)(directory, { recursive: true });
    const entry = {
        capturedAt: new Date().toISOString(),
        method: input.method.toUpperCase(),
        endpoint: input.endpoint,
        request: {
            params: input.params,
            headers: input.requestHeaders,
            body: tryParseBuffer(input.requestBody),
        },
        response: {
            status: input.status,
            data: input.responseBody,
        },
    };
    // aplica hide por path exato
    for (const p of config.fields?.hide ?? []) {
        setByPath(entry, p, 'hide');
    }
    // aplica obfuscate por path exato
    for (const p of SENSITIVE_KEYS ?? []) {
        setByPath(entry, p, 'obfuscate');
    }
    const processedResponseData = entry.response.data;
    // dedupe só em cima de response.data já processado
    if (config.deduplicate && isSameResponse(processedResponseData, previousResponse)) {
        return;
    }
    entry.response.data = isSameResponse(processedResponseData, previousResponse)
        ? SAME_AS_PREVIOUS_RESPONSE
        : processedResponseData;
    existingEntries.push(entry);
    await (0, promises_1.writeFile)(filePath, JSON.stringify(existingEntries, null, 2));
};
exports.recordTraffic = recordTraffic;
