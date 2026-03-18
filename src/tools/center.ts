import { z } from 'zod';
import type { Registry } from '../registry';
import type { SpecCache } from '../spec-cache';
import type { SchemaObject } from '../types';
import { loadSpec } from '../loader';
import { resolveShallow, lookupRef } from '../normalizer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenAPIDoc = Record<string, any>;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

export const listApisSchema = z.object({
  serviceName: z.string().describe('Service name (projectId)'),
});

export const describeApiSchema = z.object({
  serviceName: z.string().describe('Service name (projectId)'),
  path: z.string().describe('API path (e.g. /pets/{petId})'),
  method: z.string().describe('HTTP method (e.g. get, post)'),
});

export const describeComponentSchema = z.object({
  serviceName: z.string().describe('Service name (projectId)'),
  refs: z.array(z.string()).describe('List of $ref paths (e.g. #/components/schemas/Pet)'),
});

export const describeCommonTypesSchema = z.object({
  serviceName: z.string().describe('Service name (projectId)'),
});

async function fetchSpec(
  registry: Registry,
  cache: SpecCache,
  serviceName: string,
): Promise<OpenAPIDoc | null> {
  const project = registry.getProject(serviceName);
  if (!project) return null;

  const cached = cache.get(project.source);
  if (cached) return cached;

  const { doc } = await loadSpec(project.source);
  cache.set(project.source, doc);
  return doc;
}

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function extractFirstMediaSchema(
  contentObj: Record<string, unknown> | undefined,
): SchemaObject | undefined {
  if (!contentObj || typeof contentObj !== 'object') return undefined;
  const firstMedia = Object.values(contentObj as Record<string, Record<string, unknown>>)[0];
  return firstMedia?.schema as SchemaObject | undefined;
}

export function createCenterTools(registry: Registry, cache: SpecCache) {
  return {
    async listServices() {
      const projects = registry.listProjects();
      const results = await Promise.all(
        projects.map(async (p) => {
          const doc = await fetchSpec(registry, cache, p.projectId);
          const apiGroups = new Set<string>();
          if (doc?.paths) {
            for (const pathItem of Object.values(doc.paths)) {
              if (!pathItem || typeof pathItem !== 'object') continue;
              for (const method of HTTP_METHODS) {
                const op = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
                if (op?.tags && Array.isArray(op.tags)) {
                  for (const tag of op.tags) apiGroups.add(tag as string);
                }
              }
            }
          }
          return {
            serviceName: p.projectId,
            source: p.source,
            apiGroups: [...apiGroups],
          };
        }),
      );
      return jsonResult(results);
    },

    async listApis(args: z.infer<typeof listApisSchema>) {
      const doc = await fetchSpec(registry, cache, args.serviceName);
      if (!doc) return errorResult(`Service "${args.serviceName}" not found`);

      const result: Record<string, Record<string, { tags: string[]; operationId?: string; summary?: string }>> = {};
      const paths = doc.paths ?? {};

      for (const [path, pathItem] of Object.entries(paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        const item = pathItem as Record<string, unknown>;

        for (const method of HTTP_METHODS) {
          const op = item[method] as Record<string, unknown> | undefined;
          if (!op) continue;

          if (!result[path]) result[path] = {};
          result[path][method] = {
            tags: (op.tags as string[]) ?? [],
            operationId: op.operationId as string | undefined,
            summary: op.summary as string | undefined,
          };
        }
      }

      return jsonResult(result);
    },

    async describeApi(args: z.infer<typeof describeApiSchema>) {
      const doc = await fetchSpec(registry, cache, args.serviceName);
      if (!doc) return errorResult(`Service "${args.serviceName}" not found`);

      const method = args.method.toLowerCase();
      const pathItem = doc.paths?.[args.path];
      if (!pathItem) return errorResult(`Path "${args.path}" not found`);

      const operation = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
      if (!operation) return errorResult(`Method "${args.method}" not found for path "${args.path}"`);

      // Parameters: shallow resolve
      const parameters = ((operation.parameters as Array<Record<string, unknown>>) ?? []).map((p) => ({
        name: p.name as string,
        in: p.in as string,
        required: (p.required as boolean) ?? false,
        schema: p.schema ? resolveShallow(doc, p.schema as SchemaObject) : undefined,
        description: p.description as string | undefined,
      }));

      // RequestBody: extract schema from first media type, preserve component $refs
      let requestBody: SchemaObject | undefined;
      if (operation.requestBody) {
        const rb = operation.requestBody as Record<string, unknown>;
        const rawSchema = extractFirstMediaSchema(rb.content as Record<string, unknown> | undefined);
        if (rawSchema) {
          requestBody = resolveShallow(doc, rawSchema);
        }
      }

      // Responses: extract schema from first response's first media type
      let responses: SchemaObject | undefined;
      if (operation.responses && typeof operation.responses === 'object') {
        for (const resObj of Object.values(operation.responses as Record<string, Record<string, unknown>>)) {
          const rawSchema = extractFirstMediaSchema(resObj.content as Record<string, unknown> | undefined);
          if (rawSchema) {
            responses = resolveShallow(doc, rawSchema);
            break;
          }
        }
      }

      return jsonResult({ parameters, requestBody, responses });
    },

    async describeComponent(args: z.infer<typeof describeComponentSchema>) {
      const doc = await fetchSpec(registry, cache, args.serviceName);
      if (!doc) return errorResult(`Service "${args.serviceName}" not found`);

      const result: Record<string, SchemaObject | null> = {};
      for (const ref of args.refs) {
        const raw = lookupRef(doc, ref);
        if (!raw) {
          result[ref] = null;
        } else {
          // 1단계 해석: 내부의 $ref는 유지
          result[ref] = resolveShallow(doc, raw);
        }
      }

      return jsonResult(result);
    },

    async describeCommonTypes(args: z.infer<typeof describeCommonTypesSchema>) {
      const doc = await fetchSpec(registry, cache, args.serviceName);
      if (!doc) return errorResult(`Service "${args.serviceName}" not found`);

      // Extract common responses from components/responses
      const responses: Record<string, { description: string; schema?: SchemaObject }> = {};
      const componentResponses = doc.components?.responses as Record<string, Record<string, unknown>> | undefined;
      if (componentResponses) {
        for (const [name, resObj] of Object.entries(componentResponses)) {
          const rawSchema = extractFirstMediaSchema(resObj.content as Record<string, unknown> | undefined);
          responses[name] = {
            description: (resObj.description as string) ?? '',
            schema: rawSchema ? resolveShallow(doc, rawSchema) : undefined,
          };
        }
      }

      // Extract common schemas from components/schemas
      const commonSchemas: Record<string, SchemaObject> = {};
      const componentSchemas = doc.components?.schemas as Record<string, SchemaObject> | undefined;
      if (componentSchemas) {
        for (const [name, schema] of Object.entries(componentSchemas)) {
          commonSchemas[name] = resolveShallow(doc, schema);
        }
      }

      return jsonResult({ responses, schemas: commonSchemas });
    },
  };
}
