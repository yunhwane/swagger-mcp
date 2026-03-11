import { z } from 'zod';
import type { Registry } from '../registry';
import type { SpecCache } from '../spec-cache';
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

export function createDiffTools(registry: Registry, cache: SpecCache) {
  return {
    async diffApis(args: z.infer<typeof diffApisSchema>) {
      const project = registry.getProject(args.serviceName);
      if (!project) {
        return errorResult(`Service "${args.serviceName}" not found`);
      }

      // Load current spec
      const cached = cache.get(project.source);
      let oldDoc: Record<string, unknown>;
      if (cached) {
        oldDoc = cached;
      } else {
        const { doc } = await loadSpec(project.source);
        cache.set(project.source, doc);
        oldDoc = doc;
      }

      // Load new spec
      const { doc: newDoc } = await loadSpec(args.newSource);

      const oldSnap = normalize(oldDoc);
      const newSnap = normalize(newDoc);
      const diff = diffSnapshots(oldSnap, newSnap);

      return jsonResult({
        serviceName: args.serviceName,
        oldVersion: oldSnap.info.version,
        newVersion: newSnap.info.version,
        ...diff,
      });
    },
  };
}
