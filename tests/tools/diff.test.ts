import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiffTools } from '../../src/tools/diff';
import { Registry } from '../../src/registry';
import { SnapshotStore } from '../../src/snapshot-store';
import { SpecCache } from '../../src/spec-cache';
import { normalize } from '../../src/normalizer';
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
  let snapshotStore: SnapshotStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'swagger-mcp-diff-'));
    registry = new Registry(tmpDir);
    cache = new SpecCache();
    snapshotStore = new SnapshotStore(tmpDir);

    registry.addProject({
      projectId: 'petstore',
      name: 'Petstore',
      source: 'https://example.com/petstore.json',
    });

    // Save initial snapshot (simulating what add_project would do)
    const snap = normalize(petstoreV1 as Record<string, unknown>);
    await snapshotStore.save('petstore', snap, JSON.stringify(petstoreV1));

    mockedLoadSpec.mockReset();
  });

  it('저장된 스냅샷과 새 스펙의 diff 결과를 반환한다', async () => {
    mockedLoadSpec.mockResolvedValueOnce({
      doc: petstoreV2 as Record<string, unknown>,
      raw: JSON.stringify(petstoreV2),
    });

    const tools = createDiffTools(registry, cache, snapshotStore);
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
    expect(data.summary.added + data.summary.removed + data.summary.modified).toBeGreaterThan(0);
  });

  it('존재하지 않는 serviceName이면 에러를 반환한다', async () => {
    const tools = createDiffTools(registry, cache, snapshotStore);
    const result = await tools.diffApis({
      serviceName: 'nonexistent',
      newSource: 'https://example.com/new.json',
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0]!.text).toContain('not found');
  });

  it('스냅샷이 없으면 URL에서 가져와 비교한다 (하위 호환)', async () => {
    // New project without snapshot
    registry.addProject({
      projectId: 'nosnap',
      name: 'No Snapshot',
      source: 'https://example.com/nosnap.json',
    });

    mockedLoadSpec
      .mockResolvedValueOnce({ doc: petstoreV1 as Record<string, unknown>, raw: JSON.stringify(petstoreV1) })
      .mockResolvedValueOnce({ doc: petstoreV2 as Record<string, unknown>, raw: JSON.stringify(petstoreV2) });

    const tools = createDiffTools(registry, cache, snapshotStore);
    const result = await tools.diffApis({
      serviceName: 'nosnap',
      newSource: 'https://example.com/new.json',
    });

    const data = JSON.parse(result.content[0]!.text);
    expect(data.summary).toBeDefined();
  });

  it('변경사항이 있으면 새 스냅샷을 자동 저장한다', async () => {
    mockedLoadSpec.mockResolvedValueOnce({
      doc: petstoreV2 as Record<string, unknown>,
      raw: JSON.stringify(petstoreV2),
    });

    const tools = createDiffTools(registry, cache, snapshotStore);
    await tools.diffApis({
      serviceName: 'petstore',
      newSource: 'https://example.com/petstore-v2.json',
    });

    const latest = await snapshotStore.getLatest('petstore');
    expect(latest!.normalized.info.version).toBe('2.0.0');
  });

  it('변경사항이 없으면 스냅샷을 추가하지 않는다', async () => {
    mockedLoadSpec.mockResolvedValueOnce({
      doc: petstoreV1 as Record<string, unknown>,
      raw: JSON.stringify(petstoreV1),
    });

    const tools = createDiffTools(registry, cache, snapshotStore);
    await tools.diffApis({
      serviceName: 'petstore',
      newSource: 'https://example.com/petstore-same.json',
    });

    const history = await snapshotStore.listHistory('petstore');
    expect(history).toHaveLength(1);
  });
});
