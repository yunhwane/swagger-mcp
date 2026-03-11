import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalizer';
import petstore from './fixtures/petstore-v1.json' with { type: 'json' };

describe('normalizer', () => {
  const result = normalize(petstore);

  it('paths를 Endpoint[]로 변환한다', () => {
    expect(result.endpoints).toHaveLength(3);
    const keys = result.endpoints.map((e) => e.key);
    expect(keys).toContain('GET /pets');
    expect(keys).toContain('POST /pets');
    expect(keys).toContain('GET /pets/{petId}');
  });

  it('endpoint key는 "METHOD /path" 형식이다', () => {
    for (const ep of result.endpoints) {
      expect(ep.key).toMatch(/^[A-Z]+ \//);
    }
  });

  it('endpoint에 method, path, summary가 있다', () => {
    const listPets = result.endpoints.find((e) => e.key === 'GET /pets')!;
    expect(listPets.method).toBe('get');
    expect(listPets.path).toBe('/pets');
    expect(listPets.summary).toBe('List all pets');
  });

  it('parameters를 파싱한다', () => {
    const listPets = result.endpoints.find((e) => e.key === 'GET /pets')!;
    expect(listPets.parameters).toHaveLength(1);
    expect(listPets.parameters[0]!.name).toBe('limit');
    expect(listPets.parameters[0]!.in).toBe('query');
    expect(listPets.parameters[0]!.required).toBe(false);
  });

  it('requestBody를 파싱한다', () => {
    const createPet = result.endpoints.find((e) => e.key === 'POST /pets')!;
    expect(createPet.requestBody).toBeDefined();
    expect(createPet.requestBody!.required).toBe(true);
  });

  it('components.schemas를 Schema[]로 변환한다', () => {
    expect(result.schemas).toHaveLength(3);
    const names = result.schemas.map((s) => s.name);
    expect(names).toContain('Pet');
    expect(names).toContain('NewPet');
    expect(names).toContain('Error');
  });

  it('$ref를 resolve한다', () => {
    const listPets = result.endpoints.find((e) => e.key === 'GET /pets')!;
    const responseSchema =
      listPets.responses['200']?.content?.['application/json']?.schema;
    expect(responseSchema).toBeDefined();
    // items should be resolved, not a $ref
    expect(responseSchema!.items!.$ref).toBeUndefined();
    expect(responseSchema!.items!.type).toBe('object');
    expect(responseSchema!.items!.properties?.['id']).toBeDefined();
  });

  it('info를 파싱한다', () => {
    expect(result.info.title).toBe('Petstore API');
    expect(result.info.version).toBe('1.0.0');
  });

  it('tags를 파싱한다', () => {
    const listPets = result.endpoints.find((e) => e.key === 'GET /pets')!;
    expect(listPets.tags).toEqual(['pets']);
  });

  it('순환 참조에서 깨지지 않는다', () => {
    const circular: Record<string, unknown> = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              children: {
                type: 'array',
                items: { $ref: '#/components/schemas/Node' },
              },
            },
          },
        },
      },
    };
    const r = normalize(circular);
    expect(r.schemas).toHaveLength(1);
    const nodeSchema = r.schemas[0]!;
    // children.items should have a $ref marker instead of infinite recursion
    expect(nodeSchema.schema.properties?.['children']?.items).toBeDefined();
  });

  it('allOf를 머지한다', () => {
    const doc: Record<string, unknown> = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Base: {
            type: 'object',
            properties: { id: { type: 'integer' } },
          },
          Extended: {
            allOf: [
              { $ref: '#/components/schemas/Base' },
              {
                type: 'object',
                properties: { name: { type: 'string' } },
              },
            ],
          },
        },
      },
    };
    const r = normalize(doc);
    const ext = r.schemas.find((s) => s.name === 'Extended')!;
    expect(ext.schema.properties?.['id']).toBeDefined();
    expect(ext.schema.properties?.['name']).toBeDefined();
  });
});
