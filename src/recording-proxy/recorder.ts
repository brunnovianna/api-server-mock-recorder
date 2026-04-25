import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AsmrConfig, config as defaultConfig } from '../config';

type ProxyName = string;

type RecordTrafficInput = {
  proxyName: ProxyName;
  method: string;
  endpoint: string;
  params: Record<string, string>;
  requestBody: Uint8Array | undefined;
  responseBody: unknown;
  status: number;
  requestHeaders: Record<string, string>;
  outputDir?: string;
};

type RecordedRequest = {
  params: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
};

type RecordedResponse = {
  status: number;
  data: unknown;
}

type RecordedEntry = {
  capturedAt: string;
  method: string;
  endpoint: string;
  request: RecordedRequest;
  response: RecordedResponse;
};

declare global {
  // Debug buffer available at runtime for captured entries.
  var ASMR: RecordedEntry[];
}

const FALLBACK_OUTPUT_DIR = 'captured-mocks';
let config: AsmrConfig;

/** Mounts configuration object by reading consumer asmr.config.js (if any) and
 * merge it with default configuration. Fallsback to ASMR config if error.
 */
const candidate = path.join(process.cwd(), 'asmr.config.js');
try {
  const rawConsumerConfig = require(candidate) as Partial<AsmrConfig> | { default?: Partial<AsmrConfig> };
  const consumerConfig =
    rawConsumerConfig &&
    typeof rawConsumerConfig === 'object' &&
    'default' in rawConsumerConfig &&
    rawConsumerConfig.default &&
    typeof rawConsumerConfig.default === 'object'
      ? rawConsumerConfig.default
      : rawConsumerConfig;
  config = { ...defaultConfig, ...consumerConfig };
} catch {
  config = defaultConfig;
}

const CONFIG_OUTPUT_DIR =
  config.outputDir ||
  config.output ||
  defaultConfig.outputDir ||
  defaultConfig.output ||
  FALLBACK_OUTPUT_DIR;
const SAME_AS_PREVIOUS_RESPONSE = 'Same as previous';

const SENSITIVE_KEYS = config.obfuscate ?? [];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_RE = /^[0-9a-f]{16,}$/i;

const GLOBAL_ASMR: RecordedEntry[] = [];
globalThis.ASMR = GLOBAL_ASMR;

type PlainObject = Record<string, unknown>;
function splitPath(path: string): string[] {
  return path.split('.').filter(Boolean);
}
function setByPath(root: PlainObject, path: string, mode: 'hide' | 'obfuscate') {
  const parts = splitPath(path);
  if (parts.length === 0) return;
  let node: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node || typeof node !== 'object') return;
    node = (node as PlainObject)[parts[i]];
  }
  if (!node || typeof node !== 'object') return;
  const parent = node as PlainObject;
  const key = parts[parts.length - 1];
  if (!(key in parent)) return;
  if (mode === 'hide') delete parent[key];
  else parent[key] = '***';
}




const tryParseBuffer = (rawBody: Uint8Array | undefined): unknown => {
  if (!rawBody || rawBody.length === 0) {
    return null;
  }

  const asText = Buffer.from(rawBody).toString('utf-8');
  try {
    return JSON.parse(asText) as unknown;
  } catch {
    return asText;
  }
};

const normalizePathSegment = (segment: string): string => {
  if (!segment) {
    return segment;
  }

  if (/^\d+$/.test(segment) || UUID_RE.test(segment) || LONG_HEX_RE.test(segment)) {
    return '[id]';
  }

  return segment.toLowerCase().replace(/[^a-z0-9-]/g, '-');
};

const buildOutputFilePath = (
  outputRoot: string,
  proxyName: ProxyName,
  method: string,
  endpoint: string,
): string => {
  const safeProxyName = proxyName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const normalizedPath = endpoint
    .split('/')
    .filter(Boolean)
    .map(normalizePathSegment)
    .join('__');

  const safePath = normalizedPath || 'root';
  const fileName = `${method.toUpperCase()}__${safePath}.json`;
  return path.join(outputRoot, safeProxyName || 'proxy', fileName);
};

const readExistingEntries = async (filePath: string): Promise<RecordedEntry[]> => {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as RecordedEntry[]) : [];
  } catch {
    return [];
  }
};

const getLastConcreteResponse = (entries: RecordedEntry[]): unknown => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const responseData = entries[index].response.data;
    if (responseData !== SAME_AS_PREVIOUS_RESPONSE) {
      return responseData;
    }
  }
  return undefined;
};

const isSameResponse = (current: unknown, previous: unknown): boolean => {
  if (typeof previous === 'undefined') {
    return false;
  }
  return JSON.stringify(current) === JSON.stringify(previous);
};

export const resolveOutputDir = (outputDirFromCli?: string): string => outputDirFromCli || CONFIG_OUTPUT_DIR;

export const recordTraffic = async (input: RecordTrafficInput) => {
  const outputDirFromCli = input.outputDir;
  const outputRoot = path.resolve(process.cwd(), resolveOutputDir(outputDirFromCli));
  const filePath = buildOutputFilePath(outputRoot, input.proxyName, input.method, input.endpoint);
  const existingEntries = await readExistingEntries(filePath);
  const previousResponse = getLastConcreteResponse(existingEntries);
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const entry: RecordedEntry = {
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
    setByPath(entry as Record<string, unknown>, p, 'hide');
  }
  // aplica obfuscate por path exato
  for (const p of SENSITIVE_KEYS ?? []) {
    setByPath(entry as Record<string, unknown>, p, 'obfuscate');
  }
  const processedResponseData = (entry.response as { data: unknown }).data;

  if (config.deduplicate && isSameResponse(processedResponseData, previousResponse)) {
    return;
  }
  entry.response.data = isSameResponse(processedResponseData, previousResponse)
    ? SAME_AS_PREVIOUS_RESPONSE
    : processedResponseData;
  existingEntries.push(entry);
  await writeFile(filePath, JSON.stringify(existingEntries, null, 2));

  globalThis.ASMR.push(entry);
};
