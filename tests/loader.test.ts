import { describe, it, expect } from 'vitest';
import { loadSpec } from '../src/loader';
import { resolve } from 'path';

const fixtureDir = resolve(import.meta.dirname, 'fixtures');

describe('loader', () => {
  it('로컬 JSON 파일을 로드한다', async () => {
    const result = await loadSpec(`${fixtureDir}/petstore-v1.json`);
    expect(result.doc.openapi).toBe('3.0.3');
    expect(result.raw).toBeTruthy();
  });

  it('OpenAPI 3.x 버전을 검증한다', async () => {
    const result = await loadSpec(`${fixtureDir}/petstore-v1.json`);
    expect(result.doc.openapi).toMatch(/^3\./);
  });

  it('잘못된 JSON이면 에러를 반환한다', async () => {
    await expect(loadSpec(`${fixtureDir}/nonexistent.json`)).rejects.toThrow();
  });

  it('로컬 YAML 파일을 로드한다', async () => {
    const result = await loadSpec(`${fixtureDir}/petstore-v1.yaml`);
    expect(result.doc.openapi).toBe('3.0.3');
  });

  it('OpenAPI 2.x (Swagger)이면 에러를 반환한다', async () => {
    await expect(loadSpec(`${fixtureDir}/swagger2.json`)).rejects.toThrow(
      /OpenAPI 3/,
    );
  });
});
