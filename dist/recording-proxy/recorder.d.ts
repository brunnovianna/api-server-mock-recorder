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
    outputRoot?: string;
};
export declare const resolveOutputDir: (outputDirFromCli?: string) => string;
export declare const recordTraffic: (input: RecordTrafficInput) => Promise<void>;
export {};
