export type AsmrConfig = {
    outputDir?: string;
    output?: string;
    deduplicate: boolean;
    fields: {
        show: string[];
        hide: string[];
    };
    sanitize: string[];
};
export declare const config: AsmrConfig;
