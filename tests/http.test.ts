import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server, request as httpRequest } from 'http';
import { createHttpRequestHandler } from '../src/http-handler';

let server: Server | undefined;

function startServer(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const handler = createHttpRequestHandler();
    const s = createServer(handler);
    s.listen(port, () => resolve(s));
  });
}

function closeServer(s: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    s.close((err) => (err ? reject(err) : resolve()));
  });
}

afterEach(async () => {
  if (server) {
    await closeServer(server);
    server = undefined;
  }
});

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'text/event-stream, application/json',
};

const INIT_BODY = JSON.stringify({
  jsonrpc: '2.0',
  method: 'initialize',
  id: 1,
  params: {
    capabilities: {},
    protocolVersion: '2025-03-26',
    clientInfo: { name: 'test', version: '1.0' },
  },
});

/** Low-level HTTP request that allows setting Host header */
function rawRequest(options: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string>,
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe('HTTP transport', () => {
  it('responds to POST /mcp with initialize', async () => {
    const port = 39123;
    server = await startServer(port);

    const res = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: INIT_BODY,
    });

    expect(res.status).toBe(200);
    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    // Parse SSE response to get the JSON-RPC result
    const text = await res.text();
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    expect(dataLine).toBeTruthy();
    const json = JSON.parse(dataLine!.replace('data: ', ''));
    expect(json.result).toBeDefined();
    expect(json.result.serverInfo.name).toBe('swagger-mcp');
  });

  it('rejects non-/mcp paths with 404', async () => {
    const port = 39124;
    server = await startServer(port);

    const res = await fetch(`http://localhost:${port}/other`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: '{}',
    });

    expect(res.status).toBe(404);
  });

  it('supports DELETE /mcp for session termination', async () => {
    const port = 39125;
    server = await startServer(port);

    // First initialize to get a session
    const initRes = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: INIT_BODY,
    });

    const sessionId = initRes.headers.get('mcp-session-id');
    await initRes.text(); // consume body

    const delRes = await fetch(`http://localhost:${port}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId! },
    });

    expect(delRes.status).toBe(200);
  });

  it('validates Host header for DNS rebinding protection', async () => {
    const port = 39126;
    server = await startServer(port);

    const res = await rawRequest({
      port,
      method: 'POST',
      path: '/mcp',
      headers: {
        ...MCP_HEADERS,
        Host: 'evil.com',
      },
      body: INIT_BODY,
    });

    expect(res.status).toBe(403);
  });
});
