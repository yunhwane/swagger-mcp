# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP server that reads Swagger/OpenAPI specs and lets MCP clients (Claude Desktop, Claude Code) explore API schemas through natural language. Projects are registered once with `add_project`, then queried conversationally via tools like `list_apis`, `describe_api`, and `describe_component`.

## Commands

```bash
npm run dev        # Run with tsx (dev mode)
npm run build      # Build with tsup → dist/
npm run check      # TypeScript type check (noEmit)
npm test           # Run all tests (vitest run)
npx vitest run tests/loader.test.ts  # Run a single test file
```

## Architecture

The server exposes 6 MCP tools organized in two groups:

**Project tools** (`src/tools/project.ts`): `add_project`, `list_projects` — manage project registry.

**Center tools** (`src/tools/center.ts`): `list_services`, `list_apis`, `describe_api`, `describe_component` — the main query interface using a 4-step drill-down pattern (list services → list APIs → describe API → describe component).

### Key Data Flow

1. **Registry** (`src/registry.ts`) — persists project metadata to `~/.swagger-mcp/registry.json`
2. **Loader** (`src/loader.ts`) — fetches specs from URL or file, parses JSON/YAML, validates OpenAPI 3.x
3. **Normalizer** (`src/normalizer.ts`) — resolves `$ref` references recursively (with circular ref detection). `resolveShallow()` preserves component-level `$ref`s for the center tools' drill-down pattern
4. **SpecCache** (`src/spec-cache.ts`) — LRU cache (max 20, 5min TTL) for parsed OpenAPI docs

### Important Patterns

- Center tools use **shallow resolution** (`resolveShallow`) — properties are expanded one level but component schema `$ref`s are preserved. This lets the LLM decide which schemas to drill into via `describe_component`.
- Tool return values use MCP's `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` format.
- Zod schemas define tool input shapes; `.shape` is passed to `server.tool()` for MCP registration.

## Development Workflow — TDD

Always follow the Red-Green-Refactor cycle:

1. **RED** — Write a failing test first (`tests/` mirrors `src/` structure)
2. **GREEN** — Write the minimum implementation to make the test pass
3. **REFACTOR** — Clean up while keeping tests green
4. Run `npm run check && npm test` to verify before finishing

Do NOT write implementation code before its corresponding test exists.

## Tech Details

- ESM-only (`"type": "module"` in package.json)
- Node.js ≥ 20.19.0
- TypeScript strict mode with `noUncheckedIndexedAccess`
- Build target: `node20` via tsup
- Tests use vitest (configured with globals)
