import { mkdir, readFile, writeFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import type { NormalizedSnapshot, Snapshot, SnapshotMeta } from './types';

const MAX_SNAPSHOTS = 5;

export class SnapshotStore {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private projectDir(projectId: string): string {
    return join(this.baseDir, 'snapshots', projectId);
  }

  async save(
    projectId: string,
    normalized: NormalizedSnapshot,
    rawContent: string,
  ): Promise<SnapshotMeta> {
    const dir = this.projectDir(projectId);
    await mkdir(dir, { recursive: true });

    const sourceHash = createHash('sha256').update(rawContent).digest('hex').slice(0, 16);

    // Skip if identical to latest
    const latest = await this.getLatest(projectId);
    if (latest && latest.meta.sourceHash === sourceHash) {
      return latest.meta;
    }

    const snapshotId = `${Date.now()}-${sourceHash}`;
    const meta: SnapshotMeta = {
      snapshotId,
      sourceHash,
      version: normalized.info.version,
      endpointCount: normalized.endpoints.length,
      schemaCount: normalized.schemas.length,
      createdAt: new Date().toISOString(),
    };

    const snapshot: Snapshot = { meta, normalized, rawContent };
    await writeFile(join(dir, `${snapshotId}.json`), JSON.stringify(snapshot), 'utf-8');

    // Prune old snapshots
    await this.prune(projectId);

    return meta;
  }

  async getLatest(projectId: string): Promise<Snapshot | null> {
    const files = await this.listFiles(projectId);
    if (files.length === 0) return null;

    const latest = files[files.length - 1]!;
    const data = await readFile(join(this.projectDir(projectId), latest), 'utf-8');
    return JSON.parse(data) as Snapshot;
  }

  async listHistory(projectId: string): Promise<SnapshotMeta[]> {
    const files = await this.listFiles(projectId);
    const metas: SnapshotMeta[] = [];

    for (const file of files) {
      const data = await readFile(join(this.projectDir(projectId), file), 'utf-8');
      const snapshot = JSON.parse(data) as Snapshot;
      metas.push(snapshot.meta);
    }

    return metas;
  }

  private async listFiles(projectId: string): Promise<string[]> {
    try {
      const files = await readdir(this.projectDir(projectId));
      return files.filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
    } catch {
      return [];
    }
  }

  private async prune(projectId: string): Promise<void> {
    const files = await this.listFiles(projectId);
    if (files.length <= MAX_SNAPSHOTS) return;

    const toRemove = files.slice(0, files.length - MAX_SNAPSHOTS);
    const dir = this.projectDir(projectId);
    for (const file of toRemove) {
      await unlink(join(dir, file));
    }
  }
}
