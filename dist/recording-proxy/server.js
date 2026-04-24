"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startProxy = void 0;
const express_1 = __importDefault(require("express"));
const env_1 = require("@next/env");
const recorder_1 = require("./recorder");
const getTargetBaseUrl = () => process.env.TARGET_BASE_URL || '';
const buildForwardHeaders = (request) => {
    const headers = new Headers();
    Object.entries(request.headers).forEach(([key, value]) => {
        if (!value || key === 'host' || key === 'content-length' || key === 'accept-encoding') {
            return;
        }
        if (Array.isArray(value)) {
            headers.set(key, value.join(','));
            return;
        }
        headers.set(key, value);
    });
    return headers;
};
const copyResponseHeaders = (source, target) => {
    source.headers.forEach((value, key) => {
        if (key === 'content-length' || key === 'transfer-encoding' || key === 'connection' || key === 'content-encoding') {
            return;
        }
        target.setHeader(key, value);
    });
};
const getForwardBody = (request) => {
    if (request.method === 'GET' || request.method === 'HEAD') {
        return undefined;
    }
    if (request.body && Buffer.isBuffer(request.body) && request.body.length > 0) {
        return new Uint8Array(request.body);
    }
    return undefined;
};
const parseResponseBody = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const cloned = response.clone();
    if (contentType.includes('application/json')) {
        try {
            return await cloned.json();
        }
        catch {
            return null;
        }
    }
    if (contentType.includes('text/')) {
        return cloned.text();
    }
    return null;
};
const startProxy = (options) => {
    (0, env_1.loadEnvConfig)(process.cwd());
    const proxy = options.proxyName?.trim();
    if (!proxy) {
        throw new Error('[recording-proxy] --proxy-name é obrigatório.');
    }
    const port = options.port;
    const targetBaseUrl = options.targetBaseUrl || getTargetBaseUrl();
    const outputDir = options.outputDir;
    const resolvedOutputDir = (0, recorder_1.resolveOutputDir)(outputDir);
    if (!targetBaseUrl) {
        throw new Error(`[recording-proxy] Target URL não configurada para "${proxy}". Use --target-base-url ou defina TARGET_BASE_URL.`);
    }
    const app = (0, express_1.default)();
    app.disable('x-powered-by');
    app.use(express_1.default.raw({ type: '*/*', limit: '10mb' }));
    app.get('/health', (_request, response) => {
        response.json({
            ok: true,
            service: 'recording-proxy',
            proxyName: proxy,
            targetBaseUrl,
            outputDir: resolvedOutputDir,
            port,
        });
    });
    app.all('*', async (request, response) => {
        try {
            const url = new URL(request.originalUrl, targetBaseUrl);
            const requestBody = getForwardBody(request);
            const forwardResponse = await fetch(url.toString(), {
                method: request.method,
                headers: buildForwardHeaders(request),
                body: requestBody,
            });
            const responseBody = await parseResponseBody(forwardResponse);
            const responseBuffer = Buffer.from(await forwardResponse.arrayBuffer());
            const params = Object.fromEntries(url.searchParams.entries());
            await (0, recorder_1.recordTraffic)({
                proxyName: proxy,
                method: request.method,
                endpoint: url.pathname,
                params,
                requestBody,
                responseBody,
                status: forwardResponse.status,
                requestHeaders: Object.fromEntries(buildForwardHeaders(request).entries()),
                outputDir,
            });
            copyResponseHeaders(forwardResponse, response);
            response.status(forwardResponse.status).send(responseBuffer);
            console.log(`[proxy:${proxy}] ${request.method} ${url.pathname} -> ${forwardResponse.status} (gravado)`);
        }
        catch (error) {
            console.error(`[proxy:${proxy}] erro ao encaminhar ${request.method} ${request.originalUrl}:`, error);
            response.status(502).json({
                error: 'ProxyError',
                message: 'Falha ao encaminhar requisição para a API real.',
            });
        }
    });
    return app.listen(port, () => {
        console.log(`[proxy:${proxy}] escutando em http://localhost:${port} -> ${targetBaseUrl}`);
    });
};
exports.startProxy = startProxy;
