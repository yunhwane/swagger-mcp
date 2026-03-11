import { describe, it, expect } from 'vitest';
import { diffSnapshots } from '../src/differ';
import { normalize } from '../src/normalizer';
import petstoreV1 from './fixtures/petstore-v1.json' with { type: 'json' };
import petstoreV2 from './fixtures/petstore-v2.json' with { type: 'json' };

describe('diffSnapshots', () => {
  const oldSnap = normalize(petstoreV1);
  const newSnap = normalize(petstoreV2);

  it('endpoint added 감지', () => {
    const { endpoints } = diffSnapshots(oldSnap, newSnap);
    const added = endpoints.filter((e) => e.changeType === 'added');
    const addedKeys = added.map((e) => e.key);
    expect(addedKeys).toContain('DELETE /pets/{petId}');
    expect(addedKeys).toContain('GET /owners');
    expect(added.every((e) => !e.breaking)).toBe(true);
  });

  it('endpoint removed 감지', () => {
    const { endpoints } = diffSnapshots(newSnap, oldSnap);
    const removed = endpoints.filter((e) => e.changeType === 'removed');
    const removedKeys = removed.map((e) => e.key);
    expect(removedKeys).toContain('DELETE /pets/{petId}');
    expect(removedKeys).toContain('GET /owners');
    expect(removed.every((e) => e.breaking)).toBe(true);
  });

  it('endpoint modified 감지 (GET /pets에 status 파라미터 추가)', () => {
    const { endpoints } = diffSnapshots(oldSnap, newSnap);
    const modified = endpoints.find(
      (e) => e.key === 'GET /pets' && e.changeType === 'modified',
    );
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path === 'parameters.status')).toBe(true);
  });

  it('schema added 감지 (Owner)', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const added = schemas.filter((s) => s.changeType === 'added');
    expect(added.map((s) => s.name)).toContain('Owner');
    expect(added.every((s) => !s.breaking)).toBe(true);
  });

  it('schema removed 감지 (Error)', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const removed = schemas.filter((s) => s.changeType === 'removed');
    expect(removed.map((s) => s.name)).toContain('Error');
    expect(removed.every((s) => s.breaking)).toBe(true);
  });

  it('schema modified 감지 (Pet: tag 삭제, ownerId 추가, enum 변경)', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const pet = schemas.find((s) => s.name === 'Pet' && s.changeType === 'modified');
    expect(pet).toBeDefined();

    const changes = pet!.fieldChanges;
    // tag 필드 삭제
    expect(changes.some((c) => c.path === 'tag' && c.changeType === 'removed')).toBe(true);
    // ownerId 필드 추가
    expect(changes.some((c) => c.path === 'ownerId' && c.changeType === 'added')).toBe(true);
    // enum "pending" 삭제 (breaking) — nested inside status property
    expect(
      changes.some((c) => c.path === 'status.enum' && c.changeType === 'removed' && c.oldValue === 'pending'),
    ).toBe(true);
  });

  it('breaking change 판별', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const pet = schemas.find((s) => s.name === 'Pet' && s.changeType === 'modified');
    expect(pet!.breaking).toBe(true);

    // Error schema 삭제는 breaking
    const errorSchema = schemas.find((s) => s.name === 'Error');
    expect(errorSchema!.breaking).toBe(true);
  });

  it('NewPet에 required 필드 추가 → breaking', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const newPet = schemas.find((s) => s.name === 'NewPet' && s.changeType === 'modified');
    expect(newPet).toBeDefined();
    expect(newPet!.breaking).toBe(true);
    expect(
      newPet!.fieldChanges.some(
        (c) => c.path === 'required' && c.changeType === 'added' && c.newValue === 'ownerId',
      ),
    ).toBe(true);
  });

  it('summary 카운트 정확성', () => {
    const { summary } = diffSnapshots(oldSnap, newSnap);
    // Endpoints: 2 added, 0 removed, 3 modified (GET /pets, POST /pets, GET /pets/{petId}) = 5
    // Schemas: 1 added (Owner), 1 removed (Error), 2 modified (Pet, NewPet) = 4
    expect(summary.added).toBe(3); // 2 endpoints + 1 schema
    expect(summary.removed).toBe(1); // 1 schema (Error)
    expect(summary.modified).toBe(5); // 3 endpoints + 2 schemas
    expect(summary.breaking).toBeGreaterThanOrEqual(3); // Error removed + Pet modified + NewPet modified + endpoint response changes
  });

  it('동일한 스냅샷 비교 시 변경 없음', () => {
    const { endpoints, schemas, summary } = diffSnapshots(oldSnap, oldSnap);
    expect(endpoints).toHaveLength(0);
    expect(schemas).toHaveLength(0);
    expect(summary.added).toBe(0);
    expect(summary.removed).toBe(0);
    expect(summary.modified).toBe(0);
    expect(summary.breaking).toBe(0);
  });
});

describe('diffSnapshots — responses diff', () => {
  function makeSnap(responses: Record<string, import('../src/types').ResponseDef>): import('../src/types').NormalizedSnapshot {
    return {
      endpoints: [
        {
          key: 'GET /items',
          method: 'get',
          path: '/items',
          parameters: [],
          responses,
          tags: [],
        },
      ],
      schemas: [],
      info: { title: 'Test', version: '1.0.0' },
    };
  }

  it('response status code 추가 감지', () => {
    const old = makeSnap({
      '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array' } } } },
    });
    const nw = makeSnap({
      '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array' } } } },
      '404': { description: 'Not Found' },
    });
    const { endpoints } = diffSnapshots(old, nw);
    const modified = endpoints.find((e) => e.changeType === 'modified');
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path === 'responses.404' && d.changeType === 'added')).toBe(true);
    expect(modified!.details.find((d) => d.path === 'responses.404')!.breaking).toBe(false);
  });

  it('response status code 삭제 감지 (breaking)', () => {
    const old = makeSnap({
      '200': { description: 'OK' },
      '404': { description: 'Not Found' },
    });
    const nw = makeSnap({
      '200': { description: 'OK' },
    });
    const { endpoints } = diffSnapshots(old, nw);
    const modified = endpoints.find((e) => e.changeType === 'modified');
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path === 'responses.404' && d.changeType === 'removed' && d.breaking)).toBe(true);
  });

  it('response schema 변경 감지 ($ref 변경 포함)', () => {
    const old = makeSnap({
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/OldModel' },
          },
        },
      },
    });
    const nw = makeSnap({
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NewModel' },
          },
        },
      },
    });
    const { endpoints } = diffSnapshots(old, nw);
    const modified = endpoints.find((e) => e.changeType === 'modified');
    expect(modified).toBeDefined();
    // $ref가 properties로 들어가지 않으므로 diffSchemaObjects가 직접 비교할 수 없음
    // 대신 schema 전체가 다르다는 변경이 감지되어야 함
    expect(modified!.details.length).toBeGreaterThan(0);
    expect(modified!.details.some((d) => d.path.startsWith('responses.200.application/json.schema'))).toBe(true);
  });

  it('response content media type 추가/삭제 감지', () => {
    const old = makeSnap({
      '200': {
        description: 'OK',
        content: {
          'application/json': { schema: { type: 'object' } },
        },
      },
    });
    const nw = makeSnap({
      '200': {
        description: 'OK',
        content: {
          'application/xml': { schema: { type: 'object' } },
        },
      },
    });
    const { endpoints } = diffSnapshots(old, nw);
    const modified = endpoints.find((e) => e.changeType === 'modified');
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path === 'responses.200.application/json' && d.changeType === 'removed')).toBe(true);
    expect(modified!.details.some((d) => d.path === 'responses.200.application/xml' && d.changeType === 'added')).toBe(true);
  });
});

describe('diffSnapshots — requestBody diff', () => {
  function makeSnap(requestBody?: import('../src/types').RequestBody): import('../src/types').NormalizedSnapshot {
    return {
      endpoints: [
        {
          key: 'POST /items',
          method: 'post',
          path: '/items',
          parameters: [],
          requestBody,
          responses: { '201': { description: 'Created' } },
          tags: [],
        },
      ],
      schemas: [],
      info: { title: 'Test', version: '1.0.0' },
    };
  }

  it('requestBody 추가 감지 (required=true → breaking)', () => {
    const old = makeSnap(undefined);
    const nw = makeSnap({
      required: true,
      content: { 'application/json': { schema: { type: 'object' } } },
    });
    const { endpoints } = diffSnapshots(old, nw);
    const modified = endpoints.find((e) => e.changeType === 'modified');
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path === 'requestBody' && d.changeType === 'added' && d.breaking)).toBe(true);
  });

  it('requestBody 추가 감지 (required=false → non-breaking)', () => {
    const old = makeSnap(undefined);
    const nw = makeSnap({
      required: false,
      content: { 'application/json': { schema: { type: 'object' } } },
    });
    const { endpoints } = diffSnapshots(old, nw);
    const modified = endpoints.find((e) => e.changeType === 'modified');
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path === 'requestBody' && d.changeType === 'added' && !d.breaking)).toBe(true);
  });

  it('requestBody 삭제 감지 (breaking)', () => {
    const old = makeSnap({
      required: true,
      content: { 'application/json': { schema: { type: 'object' } } },
    });
    const nw = makeSnap(undefined);
    const { endpoints } = diffSnapshots(old, nw);
    const modified = endpoints.find((e) => e.changeType === 'modified');
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path === 'requestBody' && d.changeType === 'removed' && d.breaking)).toBe(true);
  });

  it('requestBody schema 변경 감지', () => {
    const old = makeSnap({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    });
    const nw = makeSnap({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { name: { type: 'string' }, age: { type: 'integer' } },
          },
        },
      },
    });
    const { endpoints } = diffSnapshots(old, nw);
    const modified = endpoints.find((e) => e.changeType === 'modified');
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path.startsWith('requestBody.application/json.schema') && d.changeType === 'added')).toBe(true);
  });
});
