import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Registry } from '../../src/registry';
import { createProjectTools } from '../../src/tools/project';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('project tools', () => {
  let tmpDir: string;
  let registry: Registry;
  let tools: ReturnType<typeof createProjectTools>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'swagger-mcp-pt-'));
    registry = new Registry(tmpDir);
    tools = createProjectTools(registry);
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
