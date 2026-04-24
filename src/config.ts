export type AsmrConfig = {
  outputDir?: string;
  // Backward compatibility with older config name.
  output?: string;
  deduplicate: boolean;
  fields: {
    show: string[];
    hide: string[];
  };
  obfuscate: string[];
};

export const config: AsmrConfig = {
  outputDir: 'recorded-mocks',
  deduplicate: true,
  fields: {
    show: [],
    hide: [],
  },
  obfuscate: [],
};