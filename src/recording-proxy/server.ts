import express, { Request } from 'express';
import { loadEnvConfig } from '@next/env';
import { Server } from 'node:http';

import { recordTraffic, resolveOutputDir } from './recorder';

export type ProxyName = string;
export type StartProxyOptions = {
  proxyName: ProxyName;
  port: number;
  targetBaseUrl?: string;
  outputDir?: string;
};

const getTargetBaseUrl = (): string => process.env.TARGET_BASE_URL || '';

const buildForwardHeaders = (request: Request): Headers => {
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

const copyResponseHeaders = (source: Response, target: express.Response) => {
  source.headers.forEach((value, key) => {
    if (key === 'content-length' || key === 'transfer-encoding' || key === 'connection' || key === 'content-encoding') {
      return;
    }

    target.setHeader(key, value);
  });
};

const getForwardBody = (request: Request): Uint8Array | undefined => {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  if (request.body && Buffer.isBuffer(request.body) && request.body.length > 0) {
    return new Uint8Array(request.body);
  }

  return undefined;
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('content-type') || '';
  const cloned = response.clone();

  if (contentType.includes('application/json')) {
    try {
      return await cloned.json();
    } catch {
      return null;
    }
  }

  if (contentType.includes('text/')) {
    return cloned.text();
  }

  return null;
};

export const startProxy = (options: StartProxyOptions): Server => {
  loadEnvConfig(process.cwd());

  const proxy = options.proxyName?.trim();
  if (!proxy) {
    throw new Error('[recording-proxy] --proxy-name é obrigatório.');
  }

  const port = options.port;
  const targetBaseUrl = options.targetBaseUrl || getTargetBaseUrl();
  const outputDir = options.outputDir;
  const resolvedOutputDir = resolveOutputDir(outputDir);

  if (!targetBaseUrl) {
    throw new Error(
      `[recording-proxy] Target URL não configurada para "${proxy}". Use --target-base-url ou defina TARGET_BASE_URL.`,
    );
  }

  const app = express();

  app.disable('x-powered-by');
  app.use(express.raw({ type: '*/*', limit: '10mb' }));

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
        body: requestBody as BodyInit | undefined,
      });

      const responseBody = await parseResponseBody(forwardResponse);
      const responseBuffer = Buffer.from(await forwardResponse.arrayBuffer());
      const params = Object.fromEntries(url.searchParams.entries());

      await recordTraffic({
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
    } catch (error) {
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
