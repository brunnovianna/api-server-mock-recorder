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
};
type RecordedEntry = {
    capturedAt: string;
    method: string;
    endpoint: string;
    request: RecordedRequest;
    response: RecordedResponse;
};
declare global {
    var ASMR: RecordedEntry[];
}
export declare const resolveOutputDir: (outputDirFromCli?: string) => string;
export declare const recordTraffic: (input: RecordTrafficInput) => Promise<void>;
export {};
