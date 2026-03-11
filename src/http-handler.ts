import { type IncomingMessage, type ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isHostAllowed(req: IncomingMessage): boolean {
  const host = req.headers.host;
  if (!host) return false;
  // Strip port if present
  const hostname = host.replace(/:\d+$/, '');
  return ALLOWED_HOSTS.has(hostname);
}

export function createHttpRequestHandler(): (
  req: IncomingMessage,
  res: ServerResponse,
) => void {
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

  return async (req: IncomingMessage, res: ServerResponse) => {
    // DNS rebinding protection
    if (!isHostAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: invalid Host header' }));
      return;
    }

    // Only handle /mcp path
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST') {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());

      // Check if this is an initialize request
      const isInit = Array.isArray(body)
        ? body.some((msg: { method?: string }) => msg.method === 'initialize')
        : body.method === 'initialize';

      if (isInit) {
        // Create new transport + server for this session
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        const server = await createMcpServer();
        await server.connect(transport);

        // Store session after connect (sessionId is set during handleRequest)
        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        await transport.handleRequest(req, res, body);

        // Store session after handling (sessionId is now available)
        if (transport.sessionId) {
          sessions.set(transport.sessionId, { transport });
        }
        return;
      }

      // Non-init request: look up existing session
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request: missing or invalid session' }));
        return;
      }

      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (req.method === 'GET') {
      // SSE stream for server-initiated messages
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request: missing or invalid session' }));
        return;
      }
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      return;
    }

    if (req.method === 'DELETE') {
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request: missing or invalid session' }));
        return;
      }
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      sessions.delete(sessionId);
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  };
}
