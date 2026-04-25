#!/usr/bin/env node
import { startProxy } from './recording-proxy/server';

type ArgsMap = Record<string, string>;

const usage = () => {
  console.log(`
api-server-mock-recorder

Comandos:
  proxy       Inicia proxy de gravacao

proxy:
  api-server-mock-recorder proxy --proxy-name service-a --port 4030 --target-base-url https://api.exemplo.com [--output-dir captured-mocks]
  api-server-mock-recorder proxy --proxy-name auth-service --port 4031 --target-base-url https://auth.exemplo.com [--output-dir captured-mocks]
`);
};

const parseArgs = (argv: string[]): ArgsMap => {
  const args: ArgsMap = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.replace(/^--/, '');
    const value = argv[i + 1];
    if (value && !value.startsWith('--')) {
      args[key] = value;
      i += 1;
      continue;
    }
    args[key] = 'true';
  }
  return args;
};

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

if (command === 'proxy') {
  const proxyName = args['proxy-name'];
  const port = Number(args.port || '4030');
  const outputDir = args['output-dir'];
  const targetBaseUrl = args['target-base-url'];

  if (!proxyName) {
    console.error('[api-server-mock-recorder] --proxy-name é obrigatório para o comando proxy.');
    usage();
    process.exit(1);
  }

  if (!targetBaseUrl) {
    console.error('[api-server-mock-recorder] --target-base-url é obrigatório para o comando proxy.');
    usage();
    process.exit(1);
  }

  startProxy({
    proxyName,
    port,
    outputDir,
    targetBaseUrl,
  });
} else {
  console.error(`[api-server-mock-recorder] Comando desconhecido: ${command}`);
  usage();
  process.exit(1);
}
