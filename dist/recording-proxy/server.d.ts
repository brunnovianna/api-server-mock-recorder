import { Server } from 'node:http';
export type ProxyName = string;
export type StartProxyOptions = {
    proxyName: ProxyName;
    port: number;
    targetBaseUrl?: string;
    outputDir?: string;
};
export declare const startProxy: (options: StartProxyOptions) => Server;
