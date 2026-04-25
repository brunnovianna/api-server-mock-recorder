# api-server-mock-recorder

CLI to capture real HTTP traffic during development and save requests/responses as local JSON files.

```bash
npm install -D api-server-mock-recorder
```

Start the recording proxy (recommended):

```bash
api-server-mock-recorder proxy --proxy-name billing-api --port 4040 --target-base-url https://api.exemplo.com --output-dir captured-mocks
```

### `proxy` command options

- `--proxy-name` (required): proxy name (e.g. `service-a`, `auth-service`, `billing-api`)
- `--port` (optional): local proxy port (default: `4030`)
- `--output-dir` (optional): output directory (default: `recorded-mocks`)
- `--target-base-url` (required): target API URL

## Configuration (`asmr.config.js`)

The package tries to read `asmr.config.js` from the consumer project's root.

Example:

```js
module.exports = {
  outputDir: 'captured-mocks',
  deduplicate: true,
  obfuscate: ['request.headers.authorization'],
  fields: {
    hide: ['request.headers.cookie'],
    show: [],
  },
};
```

- `outputDir` (or legacy `output`): sets the output directory
- `deduplicate`: avoids saving entries when `response.data` is equal to the last concrete response
- `obfuscate`: obfuscates configured paths with `***`
- `fields.hide`: removes paths from the final capture

## Saved data structure

This is what you may expect to see 
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

## Output structure

```text
captured-mocks/
  service-a/
    GET__customers.json
  billing-api/
    GET__invoices.json
```

Each file contains an array of captured events.