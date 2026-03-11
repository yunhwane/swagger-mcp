import { z } from 'zod';
import type { Registry } from '../registry';

export const addProjectSchema = z.object({
  projectId: z.string().describe('Unique project identifier'),
  name: z.string().describe('Display name'),
  source: z.string().describe('URL to OpenAPI spec'),
});

export function createProjectTools(registry: Registry) {
  return {
    async addProject(args: z.infer<typeof addProjectSchema>) {
      const project = registry.addProject({ ...args, sourceType: 'url' });
      await registry.save();

      // Auto-set as active if it's the first project
      if (registry.listProjects().length === 1) {
        registry.setActiveProject(project.projectId);
        await registry.save();
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                projectId: project.projectId,
                name: project.name,
                source: project.source,
                active: registry.getActiveProjectId() === project.projectId,
              },
              null,
              2,
            ),
          },
        ],
      };
    },

    async listProjects() {
      const projects = registry.listProjects();
      const activeId = registry.getActiveProjectId();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              projects.map((p) => ({
                projectId: p.projectId,
                name: p.name,
                source: p.source,
                active: p.projectId === activeId,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },

  };
}
