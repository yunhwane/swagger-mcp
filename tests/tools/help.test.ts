import { describe, it, expect } from 'vitest';
import { createHelpTool } from '../../src/tools/help';

describe('help tool', () => {
  const tool = createHelpTool();

  function getHelpData() {
    const result = tool.help();
    const entry = result.content[0]!;
    return { result, data: JSON.parse(entry.text) };
  }

  it('MCP content 형식으로 응답한다', () => {
    const { result } = getHelpData();

    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
  });

  it('사용 가능한 모든 도구 목록을 포함한다', () => {
    const { data } = getHelpData();

    const toolNames = data.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('help');
    expect(toolNames).toContain('add_project');
    expect(toolNames).toContain('list_projects');
    expect(toolNames).toContain('list_services');
    expect(toolNames).toContain('list_apis');
    expect(toolNames).toContain('describe_api');
    expect(toolNames).toContain('describe_component');
    expect(toolNames).toContain('diff_apis');
  });

  it('각 도구에 name과 description이 있다', () => {
    const { data } = getHelpData();

    for (const t of data.tools) {
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
    }
  });

  it('추천 워크플로우를 포함한다', () => {
    const { data } = getHelpData();

    expect(data).toHaveProperty('recommended_workflow');
    expect(Array.isArray(data.recommended_workflow)).toBe(true);
    expect(data.recommended_workflow.length).toBeGreaterThan(0);
  });
});
