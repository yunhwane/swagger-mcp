import { z } from 'zod';
import type { Registry } from '../registry';
import type { SpecCache } from '../spec-cache';
import type { SnapshotStore } from '../snapshot-store';
import { loadSpec } from '../loader';
import { normalize } from '../normalizer';
import { diffSnapshots } from '../differ';

export const diffApisSchema = z.object({
  serviceName: z.string().describe('Registered service name (projectId)'),
  newSource: z.string().describe('New spec source (URL or file path) to compare against'),
});

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function createDiffTools(registry: Registry, cache: SpecCache, snapshotStore: SnapshotStore) {
  return {
    async diffApis(args: z.infer<typeof diffApisSchema>) {
      try {
        const project = registry.getProject(args.serviceName);
        if (!project) {
          return errorResult(`Service "${args.serviceName}" not found`);
        }

        // Load new spec
        const { doc: newDoc, raw: newRaw } = await loadSpec(args.newSource);
        const newSnap = normalize(newDoc);

        // Load old spec: prefer saved snapshot, fallback to URL fetch
        let oldSnap;
        const savedSnapshot = await snapshotStore.getLatest(args.serviceName);
        if (savedSnapshot) {
          oldSnap = savedSnapshot.normalized;
        } else {
          // No snapshot yet — fetch from registered source and save as baseline
          const cached = cache.get(project.source);
          let oldDoc: Record<string, unknown>;
          let oldRaw: string;
          if (cached) {
            oldDoc = cached;
            oldRaw = JSON.stringify(cached);
          } else {
            const loaded = await loadSpec(project.source);
            cache.set(project.source, loaded.doc);
            oldDoc = loaded.doc;
            oldRaw = loaded.raw;
          }
          oldSnap = normalize(oldDoc);
          await snapshotStore.save(args.serviceName, oldSnap, oldRaw);
        }

        const diff = diffSnapshots(oldSnap, newSnap);

        // Auto-save new snapshot if there are changes
        const hasChanges = diff.summary.added + diff.summary.removed + diff.summary.modified > 0;
        if (hasChanges) {
          await snapshotStore.save(args.serviceName, newSnap, newRaw);
        }

        return jsonResult({
          serviceName: args.serviceName,
          oldVersion: oldSnap.info.version,
          newVersion: newSnap.info.version,
          ...diff,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        return errorResult(`Diff failed: ${message}${stack ? `\n${stack}` : ''}`);
      }
    },
  };
}
