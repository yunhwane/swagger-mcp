import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCenterTools } from '../../src/tools/center';
import { Registry } from '../../src/registry';
import { SpecCache } from '../../src/spec-cache';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import petstore from '../fixtures/petstore-v1.json' with { type: 'json' };

// Mock loadSpec
vi.mock('../../src/loader', () => ({
  loadSpec: vi.fn(),
}));

import { loadSpec } from '../../src/loader';

const mockedLoadSpec = vi.mocked(loadSpec);

describe('center tools', () => {
  let registry: Registry;
  let cache: SpecCache;

  beforeEach(async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'swagger-mcp-center-'));
    registry = new Registry(tmpDir);
    cache = new SpecCache();

    registry.addProject({
      projectId: 'petstore',
      name: 'Petstore',
      source: 'https://example.com/petstore.json',
    });
    registry.setActiveProject('petstore');

    mockedLoadSpec.mockResolvedValue({ doc: petstore, raw: JSON.stringify(petstore) });
  });

  describe('listServices', () => {
    it('등록된 서비스 목록과 apiGroups를 반환한다', async () => {
      const tools = createCenterTools(registry, cache);
      const result = await tools.listServices();
      const data = JSON.parse(result.content[0]!.text);

      expect(data).toHaveLength(1);
      expect(data[0].serviceName).toBe('petstore');
      expect(data[0].source).toBe('https://example.com/petstore.json');
      expect(data[0].apiGroups).toContain('pets');
    });
  });

  describe('listApis', () => {
    it('서비스의 API 목록을 간소화된 형태로 반환한다', async () => {
      const tools = createCenterTools(registry, cache);
      const result = await tools.listApis({ serviceName: 'petstore' });
      const data = JSON.parse(result.content[0]!.text);

      expect(data['/pets']).toBeDefined();
      expect(data['/pets'].get).toBeDefined();
      expect(data['/pets'].get.operationId).toBe('listPets');
      expect(data['/pets'].get.summary).toBe('List all pets');
      expect(data['/pets'].get.tags).toEqual(['pets']);

      expect(data['/pets'].post).toBeDefined();
      expect(data['/pets'].post.operationId).toBe('createPet');

      expect(data['/pets/{petId}']).toBeDefined();
      expect(data['/pets/{petId}'].get.operationId).toBe('getPet');
    });

    it('존재하지 않는 서비스명이면 에러를 반환한다', async () => {
      const tools = createCenterTools(registry, cache);
      const result = await tools.listApis({ serviceName: 'nonexistent' });
      expect((result as { isError?: boolean }).isError).toBe(true);
    });
  });

  describe('describeApi', () => {
    it('특정 API의 parameters, requestBody, responses를 반환한다', async () => {
      const tools = createCenterTools(registry, cache);
      const result = await tools.describeApi({
        serviceName: 'petstore',
        path: '/pets',
        method: 'post',
      });
      const data = JSON.parse(result.content[0]!.text);

      expect(data.requestBody).toBeDefined();
      expect(data.requestBody.$ref).toBe('#/components/schemas/NewPet');

      expect(data.responses).toBeDefined();
      expect(data.responses.$ref).toBe('#/components/schemas/Pet');
    });

    it('parameters가 있는 endpoint를 처리한다', async () => {
      const tools = createCenterTools(registry, cache);
      const result = await tools.describeApi({
        serviceName: 'petstore',
        path: '/pets',
        method: 'get',
      });
      const data = JSON.parse(result.content[0]!.text);

      expect(data.parameters).toHaveLength(1);
      expect(data.parameters[0].name).toBe('limit');
      expect(data.parameters[0].in).toBe('query');
    });

    it('존재하지 않는 path/method이면 에러를 반환한다', async () => {
      const tools = createCenterTools(registry, cache);
      const result = await tools.describeApi({
        serviceName: 'petstore',
        path: '/nonexistent',
        method: 'get',
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
    });
  });

  describe('describeComponent', () => {
    it('$ref 경로로 컴포넌트 스키마를 반환한다', async () => {
      const tools = createCenterTools(registry, cache);
      const result = await tools.describeComponent({
        serviceName: 'petstore',
        refs: ['#/components/schemas/Pet', '#/components/schemas/Error'],
      });
      const data = JSON.parse(result.content[0]!.text);

      expect(data['#/components/schemas/Pet']).toBeDefined();
      expect(data['#/components/schemas/Pet'].type).toBe('object');
      expect(data['#/components/schemas/Pet'].properties.id).toBeDefined();

      expect(data['#/components/schemas/Error']).toBeDefined();
      expect(data['#/components/schemas/Error'].properties.code).toBeDefined();
    });

    it('존재하지 않는 $ref는 null로 반환한다', async () => {
      const tools = createCenterTools(registry, cache);
      const result = await tools.describeComponent({
        serviceName: 'petstore',
        refs: ['#/components/schemas/NonExistent'],
      });
      const data = JSON.parse(result.content[0]!.text);
      expect(data['#/components/schemas/NonExistent']).toBeNull();
    });

    it('내부 $ref는 1단계만 해석한다', async () => {
      const nestedDoc = {
        ...petstore,
        components: {
          schemas: {
            ...petstore.components.schemas,
            Owner: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                pet: { $ref: '#/components/schemas/Pet' },
              },
            },
          },
        },
      };
      mockedLoadSpec.mockResolvedValue({ doc: nestedDoc, raw: JSON.stringify(nestedDoc) });
      cache.invalidate('https://example.com/petstore.json');

      const tools = createCenterTools(registry, cache);
      const result = await tools.describeComponent({
        serviceName: 'petstore',
        refs: ['#/components/schemas/Owner'],
      });
      const data = JSON.parse(result.content[0]!.text);
      const owner = data['#/components/schemas/Owner'];

      expect(owner.properties.name).toEqual({ type: 'string' });
      expect(owner.properties.pet).toEqual({ $ref: '#/components/schemas/Pet' });
    });
  });

  describe('캐시 동작', () => {
    it('같은 서비스 연속 호출 시 loadSpec을 한 번만 호출한다', async () => {
      const freshCache = new SpecCache();
      const tools = createCenterTools(registry, freshCache);
      mockedLoadSpec.mockClear();

      await tools.listApis({ serviceName: 'petstore' });
      await tools.listApis({ serviceName: 'petstore' });

      expect(mockedLoadSpec).toHaveBeenCalledTimes(1);
    });
  });
});
