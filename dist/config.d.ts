export type AsmrConfig = {
    outputDir?: string;
    output?: string;
    deduplicate: boolean;
    fields: {
        show: string[];
        hide: string[];
    };
    obfuscate: string[];
};
export declare const config: AsmrConfig;
