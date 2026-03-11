import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Registry } from '../../src/registry';
import { SnapshotStore } from '../../src/snapshot-store';
import { createProjectTools } from '../../src/tools/project';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../../src/loader', () => ({
  loadSpec: vi.fn(),
}));

import { loadSpec } from '../../src/loader';

const mockedLoadSpec = vi.mocked(loadSpec);

const fakeDoc = {
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/test': {
      get: { summary: 'Test endpoint', responses: { '200': { description: 'OK' } } },
    },
  },
};

describe('project tools', () => {
  let tmpDir: string;
  let registry: Registry;
  let snapshotStore: SnapshotStore;
  let tools: ReturnType<typeof createProjectTools>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'swagger-mcp-pt-'));
    registry = new Registry(tmpDir);
    snapshotStore = new SnapshotStore(tmpDir);
    tools = createProjectTools(registry, snapshotStore);

    mockedLoadSpec.mockReset();
    mockedLoadSpec.mockResolvedValue({ doc: fakeDoc, raw: JSON.stringify(fakeDoc) });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('add_project 호출 시 프로젝트가 등록된다', async () => {
    const result = await tools.addProject({
      projectId: 'test-api',
      name: 'Test API',
      source: 'https://example.com/test.json',
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.projectId).toBe('test-api');
    expect(data.active).toBe(true); // first project auto-activates
  });

  it('add_project 시 초기 스냅샷이 저장된다', async () => {
    await tools.addProject({
      projectId: 'snap-test',
      name: 'Snap Test',
      source: 'https://example.com/snap.json',
    });

    expect(mockedLoadSpec).toHaveBeenCalledWith('https://example.com/snap.json');

    const latest = await snapshotStore.getLatest('snap-test');
    expect(latest).toBeDefined();
    expect(latest!.normalized.info.version).toBe('1.0.0');
  });

  it('스펙 로드 실패해도 프로젝트 등록은 성공한다', async () => {
    mockedLoadSpec.mockRejectedValueOnce(new Error('network error'));

    const result = await tools.addProject({
      projectId: 'fail-snap',
      name: 'Fail Snap',
      source: 'https://example.com/fail.json',
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.projectId).toBe('fail-snap');

    // Snapshot should not exist
    const latest = await snapshotStore.getLatest('fail-snap');
    expect(latest).toBeNull();
  });

  it('list_projects 호출 시 목록이 반환된다', async () => {
    await tools.addProject({
      projectId: 'a',
      name: 'A',
      source: 'https://example.com/a',
    });
    await tools.addProject({
      projectId: 'b',
      name: 'B',
      source: 'https://example.com/b',
    });
    const result = await tools.listProjects();
    const data = JSON.parse(result.content[0]!.text);
    expect(data).toHaveLength(2);
  });
});
