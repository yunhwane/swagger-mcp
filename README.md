# swagger-mcp

An MCP (Model Context Protocol) server that reads Swagger/OpenAPI specs and lets MCP clients explore API schemas and descriptions through natural language.

The core idea: register a project once, and the whole team can query it conversationally — no need to re-upload specs every time.

## Quick Start

### 1. Install & Build

```bash
git clone https://github.com/yunhwane/swagger-mcp.git
cd swagger-mcp
npm install
npm run build
```

### 2. Configure your MCP client

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

### 3. Try it with the Petstore API

Once connected, just ask your MCP client:

> "Register the Petstore API from https://petstore3.swagger.io/api/v3/openapi.json and explore its endpoints."

Or walk through the 4-step drill-down:

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

## Features

### Tools (6)

| Tool | Description |
|------|-------------|
| `add_project` | Register a new OpenAPI project (URL) |
| `list_projects` | List all registered projects |
| `list_services` | List registered services with their API groups (tags) |
| `list_apis` | List all API endpoints for a service |
| `describe_api` | Get detailed info about a specific endpoint (parameters, request body, responses) |
| `describe_component` | Look up component schemas by `$ref` paths |

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

## Supported Specs

- OpenAPI 3.0.x
- OpenAPI 3.1.x
- JSON and YAML formats
- Local files and remote URLs

## Architecture

```
┌─────────────────────────────────────────────┐
│                MCP Client                    │
│         (Claude Desktop / Claude Code)       │
└──────────────────┬──────────────────────────┘
                   │ MCP Protocol (stdio)
┌──────────────────▼──────────────────────────┐
│              swagger-mcp Server              │
│                                              │
│  ┌───────────────┐  ┌────────────────────┐   │
│  │ Project Tools │  │   Center Tools     │   │
│  │  (2 ops)      │  │   (4 ops)          │   │
│  └───────┬───────┘  └────────┬───────────┘   │
│          │                   │               │
│  ┌───────▼───────┐  ┌───────▼───────────┐   │
│  │   Registry    │  │    Spec Cache      │   │
│  │ (~/.swagger-  │  │  (in-memory LRU)   │   │
│  │  mcp/)        │  │                    │   │
│  └───────────────┘  └───────┬───────────┘   │
│                             │               │
│                     ┌───────▼───────────┐   │
│                     │  Loader + Normalizer│  │
│                     │  (fetch, parse,    │   │
│                     │   resolve $refs)   │   │
│                     └────────────────────┘   │
└──────────────────────────────────────────────┘
```

1. **Registry** — stores project metadata, persists to disk
2. **Loader** — fetches OpenAPI specs from URLs or local files, parses JSON/YAML
3. **Normalizer** — resolves `$ref` references recursively with circular ref detection
4. **Spec Cache** — LRU in-memory cache for parsed OpenAPI documents

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Validation**: `zod`
- **Build**: `tsup`
- **Test**: `vitest`

## Development

```bash
# Run in development mode
npm run dev

# Type check
npm run check

# Run tests
npm test

# Build for production
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Project Structure

```
src/
  index.ts            # MCP server entry point (tool registration)
  registry.ts         # Project registry state management
  loader.ts           # OpenAPI spec fetcher (URL/file, JSON/YAML)
  normalizer.ts       # $ref resolution and spec normalization
  spec-cache.ts       # In-memory LRU cache for parsed specs
  types.ts            # TypeScript type definitions
  tools/
    project.ts        # add_project, list_projects
    center.ts         # list_services, list_apis, describe_api, describe_component
tests/
  tools/              # Tool unit tests
  fixtures/           # Test OpenAPI specs (petstore variants)
  *.test.ts           # Unit tests for loader, normalizer, registry, spec-cache
docs/
  prompts-guide.md    # Prompts usage guide
```
