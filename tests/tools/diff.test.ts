import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiffTools } from '../../src/tools/diff';
import { Registry } from '../../src/registry';
import { SpecCache } from '../../src/spec-cache';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import petstoreV1 from '../fixtures/petstore-v1.json' with { type: 'json' };
import petstoreV2 from '../fixtures/petstore-v2.json' with { type: 'json' };

vi.mock('../../src/loader', () => ({
  loadSpec: vi.fn(),
}));

import { loadSpec } from '../../src/loader';

const mockedLoadSpec = vi.mocked(loadSpec);

describe('diff tools', () => {
  let registry: Registry;
  let cache: SpecCache;

  beforeEach(async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'swagger-mcp-diff-'));
    registry = new Registry(tmpDir);
    cache = new SpecCache();

    registry.addProject({
      projectId: 'petstore',
      name: 'Petstore',
      source: 'https://example.com/petstore.json',
    });

    mockedLoadSpec.mockReset();
  });

  it('MCP 포맷으로 diff 결과를 반환한다', async () => {
    mockedLoadSpec
      .mockResolvedValueOnce({ doc: petstoreV1, raw: JSON.stringify(petstoreV1) })
      .mockResolvedValueOnce({ doc: petstoreV2, raw: JSON.stringify(petstoreV2) });

    const tools = createDiffTools(registry, cache);
    const result = await tools.diffApis({
      serviceName: 'petstore',
      newSource: 'https://example.com/petstore-v2.json',
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');

    const data = JSON.parse(result.content[0]!.text);
    expect(data.serviceName).toBe('petstore');
    expect(data.oldVersion).toBe('1.0.0');
    expect(data.newVersion).toBe('2.0.0');
    expect(data.summary).toBeDefined();
    expect(data.endpoints).toBeDefined();
    expect(data.schemas).toBeDefined();
  });

  it('존재하지 않는 serviceName이면 에러를 반환한다', async () => {
    const tools = createDiffTools(registry, cache);
    const result = await tools.diffApis({
      serviceName: 'nonexistent',
      newSource: 'https://example.com/new.json',
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0]!.text).toContain('not found');
  });

  it('캐시된 스펙을 사용하여 비교한다', async () => {
    // Pre-populate cache
    cache.set('https://example.com/petstore.json', petstoreV1 as Record<string, unknown>);
    mockedLoadSpec.mockResolvedValueOnce({ doc: petstoreV2, raw: JSON.stringify(petstoreV2) });

    const tools = createDiffTools(registry, cache);
    const result = await tools.diffApis({
      serviceName: 'petstore',
      newSource: 'https://example.com/petstore-v2.json',
    });

    // loadSpec should only be called once (for newSource)
    expect(mockedLoadSpec).toHaveBeenCalledTimes(1);
    expect(mockedLoadSpec).toHaveBeenCalledWith('https://example.com/petstore-v2.json');

    const data = JSON.parse(result.content[0]!.text);
    expect(data.summary.added).toBeGreaterThan(0);
  });
});
