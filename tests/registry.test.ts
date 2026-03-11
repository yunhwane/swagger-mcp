import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Registry } from '../src/registry';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('registry', () => {
  let tmpDir: string;
  let registry: Registry;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'swagger-mcp-reg-'));
    registry = new Registry(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('프로젝트를 추가하면 조회된다', async () => {
    await registry.addProject({
      projectId: 'my-api',
      name: 'My API',
      source: 'https://example.com/openapi.json',
    });
    const project = registry.getProject('my-api');
    expect(project).toBeDefined();
    expect(project!.name).toBe('My API');
  });

  it('projectId가 중복이면 에러를 반환한다', async () => {
    await registry.addProject({
      projectId: 'my-api',
      name: 'My API',
      source: 'https://example.com/openapi.json',
    });
    expect(() =>
      registry.addProject({
        projectId: 'my-api',
        name: 'Dup',
        source: 'https://dup.com',
        }),
    ).toThrow(/already exists/);
  });

  it('active project를 설정하고 조회한다', () => {
    registry.addProject({
      projectId: 'api-a',
      name: 'A',
      source: '/a.json',
    });
    registry.setActiveProject('api-a');
    expect(registry.getActiveProject()).toBeDefined();
    expect(registry.getActiveProject()!.projectId).toBe('api-a');
  });

  it('프로젝트 목록을 반환한다', () => {
    registry.addProject({
      projectId: 'a',
      name: 'A',
      source: '/a',
    });
    registry.addProject({
      projectId: 'b',
      name: 'B',
      source: '/b',
    });
    const list = registry.listProjects();
    expect(list).toHaveLength(2);
  });

  it('JSON 파일로 영속화하고 복원한다', async () => {
    await registry.addProject({
      projectId: 'persist',
      name: 'Persist',
      source: '/p.json',
    });
    registry.setActiveProject('persist');
    await registry.save();

    const registry2 = new Registry(tmpDir);
    await registry2.load();
    const project = registry2.getProject('persist');
    expect(project).toBeDefined();
    expect(registry2.getActiveProject()!.projectId).toBe('persist');
  });

  it('없는 프로젝트를 active로 설정하면 에러', () => {
    expect(() => registry.setActiveProject('nope')).toThrow(/not found/);
  });
});
