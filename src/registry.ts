import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Project, RegistryState } from './types';

interface AddProjectInput {
  projectId: string;
  name: string;
  source: string;
  sourceType?: 'url' | 'file';
}

export class Registry {
  private state: RegistryState = { projects: {}, activeProjectId: null };
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  addProject(input: AddProjectInput): Project {
    if (this.state.projects[input.projectId]) {
      throw new Error(`Project "${input.projectId}" already exists`);
    }
    const now = new Date().toISOString();
    const project: Project = {
      projectId: input.projectId,
      name: input.name,
      source: input.source,
      createdAt: now,
      updatedAt: now,
    };
    this.state.projects[input.projectId] = project;
    return project;
  }

  getProject(projectId: string): Project | undefined {
    return this.state.projects[projectId];
  }

  listProjects(): Project[] {
    return Object.values(this.state.projects);
  }

  setActiveProject(projectId: string): void {
    if (!this.state.projects[projectId]) {
      throw new Error(`Project "${projectId}" not found`);
    }
    this.state.activeProjectId = projectId;
  }

  getActiveProject(): Project | undefined {
    if (!this.state.activeProjectId) return undefined;
    return this.state.projects[this.state.activeProjectId];
  }

  getActiveProjectId(): string | null {
    return this.state.activeProjectId;
  }

  updateProject(projectId: string, updates: Partial<Project>): void {
    const project = this.state.projects[projectId];
    if (!project) throw new Error(`Project "${projectId}" not found`);
    Object.assign(project, updates, { updatedAt: new Date().toISOString() });
  }

  async save(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(
      join(this.baseDir, 'registry.json'),
      JSON.stringify(this.state, null, 2),
      'utf-8',
    );
  }

  async load(): Promise<void> {
    try {
      const data = await readFile(
        join(this.baseDir, 'registry.json'),
        'utf-8',
      );
      this.state = JSON.parse(data) as RegistryState;
    } catch {
      // No existing state, start fresh
      this.state = { projects: {}, activeProjectId: null };
    }
  }
}
