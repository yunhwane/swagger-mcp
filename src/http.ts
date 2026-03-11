import { createServer } from 'http';
import { createHttpRequestHandler } from './http-handler';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

const handler = createHttpRequestHandler();
const server = createServer(handler);

server.listen(PORT, () => {
  console.log(`swagger-mcp HTTP server listening on http://localhost:${PORT}/mcp`);
});
