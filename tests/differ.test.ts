import { describe, it, expect } from 'vitest';
import { diffSnapshots } from '../src/differ';
import { normalize } from '../src/normalizer';
import petstoreV1 from './fixtures/petstore-v1.json' with { type: 'json' };
import petstoreV2 from './fixtures/petstore-v2.json' with { type: 'json' };

describe('diffSnapshots', () => {
  const oldSnap = normalize(petstoreV1);
  const newSnap = normalize(petstoreV2);

  it('endpoint added 감지', () => {
    const { endpoints } = diffSnapshots(oldSnap, newSnap);
    const added = endpoints.filter((e) => e.changeType === 'added');
    const addedKeys = added.map((e) => e.key);
    expect(addedKeys).toContain('DELETE /pets/{petId}');
    expect(addedKeys).toContain('GET /owners');
    expect(added.every((e) => !e.breaking)).toBe(true);
  });

  it('endpoint removed 감지', () => {
    const { endpoints } = diffSnapshots(newSnap, oldSnap);
    const removed = endpoints.filter((e) => e.changeType === 'removed');
    const removedKeys = removed.map((e) => e.key);
    expect(removedKeys).toContain('DELETE /pets/{petId}');
    expect(removedKeys).toContain('GET /owners');
    expect(removed.every((e) => e.breaking)).toBe(true);
  });

  it('endpoint modified 감지 (GET /pets에 status 파라미터 추가)', () => {
    const { endpoints } = diffSnapshots(oldSnap, newSnap);
    const modified = endpoints.find(
      (e) => e.key === 'GET /pets' && e.changeType === 'modified',
    );
    expect(modified).toBeDefined();
    expect(modified!.details.some((d) => d.path === 'parameters.status')).toBe(true);
  });

  it('schema added 감지 (Owner)', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const added = schemas.filter((s) => s.changeType === 'added');
    expect(added.map((s) => s.name)).toContain('Owner');
    expect(added.every((s) => !s.breaking)).toBe(true);
  });

  it('schema removed 감지 (Error)', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const removed = schemas.filter((s) => s.changeType === 'removed');
    expect(removed.map((s) => s.name)).toContain('Error');
    expect(removed.every((s) => s.breaking)).toBe(true);
  });

  it('schema modified 감지 (Pet: tag 삭제, ownerId 추가, enum 변경)', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const pet = schemas.find((s) => s.name === 'Pet' && s.changeType === 'modified');
    expect(pet).toBeDefined();

    const changes = pet!.fieldChanges;
    // tag 필드 삭제
    expect(changes.some((c) => c.path === 'tag' && c.changeType === 'removed')).toBe(true);
    // ownerId 필드 추가
    expect(changes.some((c) => c.path === 'ownerId' && c.changeType === 'added')).toBe(true);
    // enum "pending" 삭제 (breaking) — nested inside status property
    expect(
      changes.some((c) => c.path === 'status.enum' && c.changeType === 'removed' && c.oldValue === 'pending'),
    ).toBe(true);
  });

  it('breaking change 판별', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const pet = schemas.find((s) => s.name === 'Pet' && s.changeType === 'modified');
    expect(pet!.breaking).toBe(true);

    // Error schema 삭제는 breaking
    const errorSchema = schemas.find((s) => s.name === 'Error');
    expect(errorSchema!.breaking).toBe(true);
  });

  it('NewPet에 required 필드 추가 → breaking', () => {
    const { schemas } = diffSnapshots(oldSnap, newSnap);
    const newPet = schemas.find((s) => s.name === 'NewPet' && s.changeType === 'modified');
    expect(newPet).toBeDefined();
    expect(newPet!.breaking).toBe(true);
    expect(
      newPet!.fieldChanges.some(
        (c) => c.path === 'required' && c.changeType === 'added' && c.newValue === 'ownerId',
      ),
    ).toBe(true);
  });

  it('summary 카운트 정확성', () => {
    const { summary } = diffSnapshots(oldSnap, newSnap);
    // Endpoints: 2 added, 0 removed, 1 modified = 3
    // Schemas: 1 added (Owner), 1 removed (Error), 2 modified (Pet, NewPet) = 4
    expect(summary.added).toBe(3); // 2 endpoints + 1 schema
    expect(summary.removed).toBe(1); // 1 schema (Error)
    expect(summary.modified).toBe(3); // 1 endpoint + 2 schemas
    expect(summary.breaking).toBeGreaterThanOrEqual(3); // Error removed + Pet modified + NewPet modified
  });

  it('동일한 스냅샷 비교 시 변경 없음', () => {
    const { endpoints, schemas, summary } = diffSnapshots(oldSnap, oldSnap);
    expect(endpoints).toHaveLength(0);
    expect(schemas).toHaveLength(0);
    expect(summary.added).toBe(0);
    expect(summary.removed).toBe(0);
    expect(summary.modified).toBe(0);
    expect(summary.breaking).toBe(0);
  });
});
