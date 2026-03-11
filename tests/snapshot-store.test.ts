import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotStore } from '../src/snapshot-store';
import { mkdtemp, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { NormalizedSnapshot } from '../src/types';

const fakeSnapshot: NormalizedSnapshot = {
  endpoints: [
    {
      key: 'GET /pets',
      method: 'get',
      path: '/pets',
      parameters: [],
      responses: {},
      tags: [],
    },
  ],
  schemas: [{ name: 'Pet', schema: { type: 'object' } }],
  info: { title: 'Petstore', version: '1.0.0' },
};

describe('SnapshotStore', () => {
  let store: SnapshotStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'swagger-mcp-snap-'));
    store = new SnapshotStore(tmpDir);
  });

  it('스냅샷을 저장하고 조회할 수 있다', async () => {
    await store.save('petstore', fakeSnapshot, 'raw-content');

    const latest = await store.getLatest('petstore');
    expect(latest).toBeDefined();
    expect(latest!.normalized.info.version).toBe('1.0.0');
    expect(latest!.rawContent).toBe('raw-content');
    expect(latest!.meta.endpointCount).toBe(1);
    expect(latest!.meta.schemaCount).toBe(1);
  });

  it('프로젝트가 없으면 null을 반환한다', async () => {
    const result = await store.getLatest('nonexistent');
    expect(result).toBeNull();
  });

  it('최대 5개까지만 유지한다', async () => {
    for (let i = 0; i < 7; i++) {
      const snap: NormalizedSnapshot = {
        ...fakeSnapshot,
        info: { title: 'Petstore', version: `${i}.0.0` },
      };
      await store.save('petstore', snap, `raw-${i}`);
    }

    const snapshotsDir = join(tmpDir, 'snapshots', 'petstore');
    const files = await readdir(snapshotsDir);
    expect(files).toHaveLength(5);

    // 최신 스냅샷이 마지막에 저장된 것이어야 한다
    const latest = await store.getLatest('petstore');
    expect(latest!.normalized.info.version).toBe('6.0.0');
  });

  it('이력 목록을 반환한다', async () => {
    await store.save('petstore', fakeSnapshot, 'raw-1');
    // Ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));
    const snap2: NormalizedSnapshot = {
      ...fakeSnapshot,
      info: { title: 'Petstore', version: '2.0.0' },
    };
    await store.save('petstore', snap2, 'raw-2');

    const history = await store.listHistory('petstore');
    expect(history).toHaveLength(2);
    expect(history[0]!.version).toBe('1.0.0');
    expect(history[1]!.version).toBe('2.0.0');
  });

  it('동일한 raw content면 저장하지 않는다', async () => {
    await store.save('petstore', fakeSnapshot, 'same-raw');
    await store.save('petstore', fakeSnapshot, 'same-raw');

    const history = await store.listHistory('petstore');
    expect(history).toHaveLength(1);
  });
});
