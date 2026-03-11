# swagger-mcp

An MCP (Model Context Protocol) server that reads Swagger/OpenAPI specs and lets MCP clients explore API schemas and descriptions through natural language.

The core idea: register a project once, and the whole team can query it conversationally — no need to re-upload specs every time.

## Supported Clients

| Client | MCP Support | STDIO | Streamable HTTP |
|--------|-------------|-------|-----------------|
| Claude Desktop | O | O | O |
| Claude Code | O | O | O |
| Cursor | O | O | O |
| Gemini (Google) | O | — | O |
| ChatGPT (OpenAI) | X | — | — |

> Streamable HTTP mode is recommended for clients that only support URL-based connections (e.g., Gemini).

## Quick Start

### 1. Install & Build

```bash
git clone https://github.com/yunhwane/swagger-mcp.git
cd swagger-mcp
npm install
npm run build
```

### 2. Configure your MCP client

Two transport modes are available: **STDIO** (default) and **Streamable HTTP**.

#### Option A: STDIO (default)

**Claude Desktop** — edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/swagger-mcp/dist/index.js"]
    }
  }
}
```

**Claude Code** — add `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/swagger-mcp/dist/index.js"]
    }
  }
}
```

#### Option B: Streamable HTTP

Start the HTTP server separately, then point your client to the URL. This mode is ideal for development — `tsx watch` auto-restarts on code changes without requiring manual MCP reconnection.

```bash
# Start the server (dev mode with hot reload)
npm run dev:http

# Or production mode
npm run build && npm run start:http
```

**Claude Code** — add `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**Gemini CLI** — edit `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

The HTTP server listens on port 3000 by default (override with `PORT` env var).

### 3. Try it with the Petstore API

Once connected, just ask your MCP client:

> "Register the Petstore API from https://petstore3.swagger.io/api/v3/openapi.json and explore its endpoints."

Or walk through the drill-down workflow:

```
1. add_project        →  Register "petstore" with the spec URL
2. list_services      →  See registered services and their API groups
3. list_apis          →  Browse all endpoints for "petstore"
4. describe_api       →  "GET /pet/{petId}" → see parameters, request/response schemas
5. describe_component →  "#/components/schemas/Pet" → drill into a specific schema
```

### Example Conversations

- "Add the Petstore API from `https://petstore3.swagger.io/api/v3/openapi.json`."
- "What endpoints are available for managing pets?"
- "Describe the `GET /pet/{petId}` endpoint."
- "What fields does the `Pet` schema have?"
- "Compare the current spec against this new version URL."

## Features

- OpenAPI 3.0.x / 3.1.x support (JSON & YAML, URL or local file)
- 4-step drill-down: services → APIs → endpoint detail → component schemas
- Shallow `$ref` resolution — keeps responses concise while letting the LLM decide which schemas to explore
- Spec diff with breaking change detection (responses, requestBody, parameters, schemas)
- Snapshot store — auto-saves normalized specs on registration and after diffs, enabling offline comparison (max 5 per project)
- LRU spec cache (max 20 entries, 5 min TTL)
- Project registry persisted to `~/.swagger-mcp/registry.json`
- Built-in `help` tool for discoverability

## Tools (8)

| Tool | Description | Inputs |
|------|-------------|--------|
| `help` | Show available tools and recommended workflow | — |
| `add_project` | Register a new OpenAPI project (URL) | `projectId`, `name`, `source` |
| `list_projects` | List all registered projects | — |
| `list_services` | List registered services with their API groups (tags) | — |
| `list_apis` | List all API endpoints for a service | `serviceName` |
| `describe_api` | Get detailed info about a specific endpoint (parameters, request body, responses) | `serviceName`, `path`, `method` |
| `describe_component` | Look up component schemas by `$ref` paths | `serviceName`, `refs` |
| `diff_apis` | Compare saved snapshot (or registered spec) against a new source, with breaking change detection | `serviceName`, `newSource` |

### 4-Step Drill-Down Pattern

The center tools (`list_services` → `list_apis` → `describe_api` → `describe_component`) use **shallow resolution**: endpoint schemas are expanded one level, but component `$ref`s are preserved. This lets the LLM decide which schemas to drill into, keeping responses concise and navigable.

## Core Concepts

### Project

A reusable unit representing an API spec source. Each project has a `projectId`, name, and source URL. Project metadata is persisted to `~/.swagger-mcp/registry.json`.

```
Example: "petstore" project pointing to https://petstore3.swagger.io/api/v3/openapi.json
```

### Spec Cache

Parsed OpenAPI documents are cached in-memory (LRU, max 20 entries, 5-minute TTL) to avoid re-fetching on every query.

### Snapshot Store

When a project is registered via `add_project`, the spec is automatically normalized and saved as a snapshot. Each call to `diff_apis` that detects changes also saves a new snapshot. Snapshots are stored in `~/.swagger-mcp/snapshots/<projectId>/` (max 5 per project, deduplicated by content hash).

### Spec Diff

`diff_apis` compares the latest saved snapshot against a new spec source. If no snapshot exists, it falls back to fetching from the registered URL. The diff engine detects:

- Endpoint additions, removals, and modifications
- Parameter changes (type, required, location)
- Response status code and media type changes (with breaking change flags)
- RequestBody additions, removals, and schema changes
- Schema property and `$ref` changes

## Architecture

```
┌─────────────────────────────────────────────┐
│                MCP Client                    │
│   (Claude Desktop / Code / Cursor / Gemini)  │
└──────────────────┬──────────────────────────┘
                   │ MCP Protocol
                   │ (STDIO or Streamable HTTP)
┌──────────────────▼──────────────────────────┐
│              swagger-mcp Server              │
│                                              │
│  ┌────────────┐ ┌────────────┐ ┌─────────┐  │
│  │  Project   │ │   Center   │ │  Diff   │  │
│  │  Tools (2) │ │  Tools (4) │ │ Tool (1)│  │
│  └─────┬──────┘ └─────┬──────┘ └────┬────┘  │
│        │              │             │        │
│  ┌─────▼──────┐ ┌─────▼─────────────▼────┐  │
│  │  Registry  │ │      Spec Cache        │  │
│  │ (~/.swagger│ │    (in-memory LRU)     │  │
│  │  -mcp/)    │ │                        │  │
│  └────────────┘ └─────────┬──────────────┘  │
│                           │                  │
│                 ┌─────────▼──────────────┐   │
│                 │  Loader + Normalizer   │   │
│                 │  (fetch, parse,        │   │
│                 │   resolve $refs)       │   │
│                 └────────────────────────┘   │
└──────────────────────────────────────────────┘
```

1. **Registry** — stores project metadata, persists to disk
2. **Loader** — fetches OpenAPI specs from URLs or local files, parses JSON/YAML
3. **Normalizer** — resolves `$ref` references recursively with circular ref detection
4. **Differ** — computes structural diff between two normalized specs (endpoints, parameters, responses, requestBody, schemas)
5. **Spec Cache** — LRU in-memory cache for parsed OpenAPI documents
6. **Snapshot Store** — persists normalized specs to disk for reliable diff comparisons

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode, `noUncheckedIndexedAccess`)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Validation**: `zod`
- **Build**: `tsup` (ESM-only, target `node20`)
- **Test**: `vitest`

## Development

```bash
npm run dev        # Run STDIO mode with tsx
npm run dev:http   # Run HTTP mode with tsx watch (auto-reload)
npm run build      # Build with tsup → dist/
npm run check      # TypeScript type check
npm run start:http # Run HTTP mode in production
npm test           # Run all tests (vitest)

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

### TDD Workflow

This project follows the Red-Green-Refactor cycle:

1. **RED** — Write a failing test first (`tests/` mirrors `src/` structure)
2. **GREEN** — Write the minimum implementation to pass the test
3. **REFACTOR** — Clean up while keeping tests green

Always run `npm run check && npm test` before finishing a change.

## Project Structure

```
src/
├── index.ts           # STDIO entry point
├── http.ts            # Streamable HTTP entry point
├── http-handler.ts    # HTTP request handler (session management, DNS rebinding protection)
├── server.ts          # Shared McpServer creation (tool registration)
├── registry.ts        # Project registry state management
├── loader.ts          # OpenAPI spec fetcher (URL/file, JSON/YAML)
├── normalizer.ts      # $ref resolution and spec normalization
├── differ.ts          # Spec diff engine (endpoints, responses, requestBody, schemas)
├── snapshot-store.ts  # Persistent snapshot storage for diff comparisons
├── spec-cache.ts      # In-memory LRU cache for parsed specs
├── types.ts           # TypeScript type definitions
└── tools/
    ├── project.ts     # add_project, list_projects
    ├── center.ts      # list_services, list_apis, describe_api, describe_component
    ├── diff.ts        # diff_apis
    └── help.ts        # help
tests/                 # Mirrors src/ structure (vitest)
  ├── tools/           # Tool unit tests
  ├── fixtures/        # Test OpenAPI specs (petstore variants)
  └── *.test.ts        # Unit tests for loader, normalizer, registry, etc.
```

## License

MIT
