import { describe, it, expect } from 'vitest';
import { resolveShallow, lookupRef } from '../src/normalizer';

const doc = {
  openapi: '3.0.3',
  info: { title: 'Test', version: '1.0.0' },
  paths: {},
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer', format: 'int64' },
          name: { type: 'string' },
          owner: { $ref: '#/components/schemas/Owner' },
        },
      },
      Owner: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          address: { $ref: '#/components/schemas/Address' },
        },
      },
      Address: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          zip: { type: 'string' },
        },
      },
      ErrorMessage: {
        type: 'object',
        properties: {
          errorCode: { type: 'integer', format: 'int32' },
          message: { type: 'string' },
        },
      },
    },
  },
};

describe('resolveShallow (preserveComponentRefs)', () => {
  it('컴포넌트 $ref를 해석하지 않고 경로를 유지한다', () => {
    const schema = {
      type: 'object',
      properties: {
        pet: { $ref: '#/components/schemas/Pet' },
        name: { type: 'string' },
      },
    };
    const result = resolveShallow(doc, schema);
    expect(result.properties?.pet).toEqual({ $ref: '#/components/schemas/Pet' });
    expect(result.properties?.name).toEqual({ type: 'string' });
  });

  it('비-컴포넌트 $ref는 정상 해석한다', () => {
    const docWithInline = {
      ...doc,
      paths: {
        '/test': {
          get: {
            parameters: [
              { $ref: '#/components/parameters/Limit' },
            ],
          },
        },
      },
      components: {
        ...doc.components,
        parameters: {
          Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } },
        },
      },
    };
    // parameters $ref는 컴포넌트 schemas가 아니므로 해석됨
    const paramRef = { $ref: '#/components/parameters/Limit' };
    const result = resolveShallow(docWithInline, paramRef);
    expect(result.name).toBe('limit');
  });

  it('allOf 내부의 컴포넌트 $ref도 유지한다', () => {
    const schema = {
      allOf: [
        { $ref: '#/components/schemas/Pet' },
        { type: 'object', properties: { extra: { type: 'string' } } },
      ],
    };
    const result = resolveShallow(doc, schema);
    // allOf의 $ref가 컴포넌트이므로 해석 안됨 → 머지 시 $ref인 항목은 스킵
    // 결과에는 extra만 나와야 함
    expect(result.properties?.extra).toEqual({ type: 'string' });
  });

  it('중첩 properties의 컴포넌트 $ref도 유지한다', () => {
    const schema = {
      type: 'object',
      properties: {
        error: { $ref: '#/components/schemas/ErrorMessage' },
        success: { type: 'boolean' },
      },
    };
    const result = resolveShallow(doc, schema);
    expect(result.properties?.error).toEqual({ $ref: '#/components/schemas/ErrorMessage' });
    expect(result.properties?.success).toEqual({ type: 'boolean' });
  });
});

describe('lookupRef', () => {
  it('$ref 경로로 스키마를 찾는다', () => {
    const result = lookupRef(doc, '#/components/schemas/Pet');
    expect(result).toBeDefined();
    expect(result!.type).toBe('object');
    expect(result!.properties?.id).toBeDefined();
  });

  it('존재하지 않는 경로는 null을 반환한다', () => {
    expect(lookupRef(doc, '#/components/schemas/NonExistent')).toBeNull();
  });

  it('1단계만 해석하고 내부 $ref는 유지한다', () => {
    // lookupRef는 단순 조회만 하므로 내부 $ref는 그대로
    const result = lookupRef(doc, '#/components/schemas/Owner');
    expect(result!.properties?.address).toEqual({ $ref: '#/components/schemas/Address' });
  });
});
