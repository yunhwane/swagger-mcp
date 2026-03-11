import type {
  Endpoint,
  Schema,
  NormalizedSnapshot,
  Parameter,
  RequestBody,
  ResponseDef,
  SchemaObject,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenAPIDoc = Record<string, any>;

export function lookupRef(doc: OpenAPIDoc, ref: string): SchemaObject | null {
  const parts = ref.replace(/^#\//, '').split('/');
  let current: unknown = doc;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return (current as SchemaObject) ?? null;
}

export function resolveShallow(doc: OpenAPIDoc, schema: SchemaObject): SchemaObject {
  const resolver = new RefResolver(doc, { preserveComponentRefs: true });
  return resolver.resolve(schema);
}

export function normalize(doc: OpenAPIDoc): NormalizedSnapshot {
  const resolver = new RefResolver(doc);
  const endpoints = extractEndpoints(doc, resolver);
  const schemas = extractSchemas(doc, resolver);
  const info = {
    title: doc.info?.title ?? '',
    version: doc.info?.version ?? '',
    description: doc.info?.description,
  };
  return { endpoints, schemas, info };
}

class RefResolver {
  private doc: OpenAPIDoc;
  private resolving = new Set<string>();
  private preserveComponentRefs: boolean;

  constructor(doc: OpenAPIDoc, options?: { preserveComponentRefs?: boolean }) {
    this.doc = doc;
    this.preserveComponentRefs = options?.preserveComponentRefs ?? false;
  }

  resolve(schema: SchemaObject): SchemaObject {
    if (!schema) return schema;

    if (schema.$ref) {
      const ref = schema.$ref;

      // Preserve component schema refs in shallow mode
      if (this.preserveComponentRefs && ref.startsWith('#/components/schemas/')) {
        return { $ref: ref };
      }

      if (this.resolving.has(ref)) {
        return { $circular: ref } as unknown as SchemaObject;
      }
      this.resolving.add(ref);
      const resolved = this.lookupRef(ref);
      const result = resolved ? this.resolve(resolved) : schema;
      this.resolving.delete(ref);
      return result;
    }

    const result: SchemaObject = { ...schema };

    if (result.allOf) {
      const merged = this.mergeAllOf(result.allOf);
      delete result.allOf;
      Object.assign(result, merged);
    }

    if (result.properties) {
      const props: Record<string, SchemaObject> = {};
      for (const [key, val] of Object.entries(result.properties)) {
        props[key] = this.resolve(val);
      }
      result.properties = props;
    }

    if (result.items) {
      result.items = this.resolve(result.items);
    }

    if (result.oneOf) {
      result.oneOf = result.oneOf.map((s) => this.resolve(s));
    }

    if (result.anyOf) {
      result.anyOf = result.anyOf.map((s) => this.resolve(s));
    }

    if (result.additionalProperties && typeof result.additionalProperties === 'object') {
      result.additionalProperties = this.resolve(result.additionalProperties as SchemaObject);
    }

    return result;
  }

  private mergeAllOf(schemas: SchemaObject[]): SchemaObject {
    const merged: SchemaObject = {};
    for (const s of schemas) {
      const resolved = this.resolve(s);
      if (resolved.properties) {
        merged.properties = { ...merged.properties, ...resolved.properties };
      }
      if (resolved.required) {
        merged.required = [...(merged.required ?? []), ...resolved.required];
      }
      if (resolved.type) {
        merged.type = resolved.type;
      }
    }
    return merged;
  }

  private lookupRef(ref: string): SchemaObject | null {
    // "#/components/schemas/Pet" → ["components", "schemas", "Pet"]
    const parts = ref.replace(/^#\//, '').split('/');
    let current: unknown = this.doc;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[part];
    }
    return (current as SchemaObject) ?? null;
  }
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

function extractEndpoints(doc: OpenAPIDoc, resolver: RefResolver): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const paths = doc.paths ?? {};

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const item = pathItem as Record<string, unknown>;

    for (const method of HTTP_METHODS) {
      const operation = item[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      const key = `${method.toUpperCase()} ${path}`;

      const parameters: Parameter[] = (
        (operation.parameters as Array<Record<string, unknown>>) ?? []
      ).map((p) => ({
        name: p.name as string,
        in: p.in as Parameter['in'],
        required: (p.required as boolean) ?? false,
        schema: p.schema ? resolver.resolve(p.schema as SchemaObject) : undefined,
        description: p.description as string | undefined,
        deprecated: p.deprecated as boolean | undefined,
      }));

      let requestBody: RequestBody | undefined;
      if (operation.requestBody) {
        const rb = operation.requestBody as Record<string, unknown>;
        const content: Record<string, { schema?: SchemaObject }> = {};
        if (rb.content && typeof rb.content === 'object') {
          for (const [mediaType, mediaObj] of Object.entries(
            rb.content as Record<string, Record<string, unknown>>,
          )) {
            content[mediaType] = {
              schema: mediaObj.schema
                ? resolver.resolve(mediaObj.schema as SchemaObject)
                : undefined,
            };
          }
        }
        requestBody = {
          required: (rb.required as boolean) ?? false,
          content,
          description: rb.description as string | undefined,
        };
      }

      const responses: Record<string, ResponseDef> = {};
      if (operation.responses && typeof operation.responses === 'object') {
        for (const [status, resObj] of Object.entries(
          operation.responses as Record<string, Record<string, unknown>>,
        )) {
          const content: Record<string, { schema?: SchemaObject }> = {};
          if (resObj.content && typeof resObj.content === 'object') {
            for (const [mediaType, mediaObj] of Object.entries(
              resObj.content as Record<string, Record<string, unknown>>,
            )) {
              content[mediaType] = {
                schema: mediaObj.schema
                  ? resolver.resolve(mediaObj.schema as SchemaObject)
                  : undefined,
              };
            }
          }
          responses[status] = {
            description: resObj.description as string | undefined,
            content: Object.keys(content).length > 0 ? content : undefined,
          };
        }
      }

      endpoints.push({
        key,
        method,
        path,
        summary: operation.summary as string | undefined,
        description: operation.description as string | undefined,
        deprecated: operation.deprecated as boolean | undefined,
        parameters,
        requestBody,
        responses,
        tags: (operation.tags as string[]) ?? [],
      });
    }
  }

  return endpoints;
}

function extractSchemas(doc: OpenAPIDoc, resolver: RefResolver): Schema[] {
  const schemas: Schema[] = [];
  const components = doc.components?.schemas ?? {};

  for (const [name, rawSchema] of Object.entries(
    components as Record<string, SchemaObject>,
  )) {
    schemas.push({
      name,
      schema: resolver.resolve(rawSchema),
    });
  }

  return schemas;
}
