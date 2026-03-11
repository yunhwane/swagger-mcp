import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpecCache } from '../src/spec-cache';

describe('SpecCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('set한 값을 get으로 조회한다', () => {
    const cache = new SpecCache();
    const doc = { openapi: '3.0.3', info: { title: 'Test', version: '1.0.0' }, paths: {} };
    cache.set('https://example.com/api.json', doc);
    expect(cache.get('https://example.com/api.json')).toEqual(doc);
  });

  it('없는 키는 null을 반환한다', () => {
    const cache = new SpecCache();
    expect(cache.get('https://missing.com')).toBeNull();
  });

  it('TTL(5분) 이후 캐시가 만료된다', () => {
    const cache = new SpecCache();
    const doc = { openapi: '3.0.3', info: { title: 'Test', version: '1.0.0' }, paths: {} };
    cache.set('https://example.com/api.json', doc);

    // 4분 59초 → 아직 유효
    vi.advanceTimersByTime(299_000);
    expect(cache.get('https://example.com/api.json')).toEqual(doc);

    // 5분 1초 → 만료
    vi.advanceTimersByTime(2_000);
    expect(cache.get('https://example.com/api.json')).toBeNull();
  });

  it('invalidate로 캐시를 강제 삭제한다', () => {
    const cache = new SpecCache();
    const doc = { openapi: '3.0.3', paths: {} };
    cache.set('https://example.com/api.json', doc);
    cache.invalidate('https://example.com/api.json');
    expect(cache.get('https://example.com/api.json')).toBeNull();
  });

  it('최대 20개까지 캐시하고 LRU로 제거한다', () => {
    const cache = new SpecCache();

    // 21개 넣기
    for (let i = 0; i < 21; i++) {
      cache.set(`https://example.com/api-${i}.json`, { openapi: '3.0.3', id: i });
    }

    // 가장 오래된 0번은 제거됨
    expect(cache.get('https://example.com/api-0.json')).toBeNull();
    // 1번~20번은 남아있음
    expect(cache.get('https://example.com/api-1.json')).not.toBeNull();
    expect(cache.get('https://example.com/api-20.json')).not.toBeNull();
  });

  it('get 호출 시 LRU 순서가 갱신된다', () => {
    const cache = new SpecCache();

    for (let i = 0; i < 20; i++) {
      cache.set(`https://example.com/api-${i}.json`, { openapi: '3.0.3', id: i });
    }

    // 0번을 조회하여 LRU 갱신
    cache.get('https://example.com/api-0.json');

    // 21번째 항목 추가 → 가장 오래된 1번이 제거되어야 함
    cache.set('https://example.com/api-20.json', { openapi: '3.0.3', id: 20 });

    expect(cache.get('https://example.com/api-0.json')).not.toBeNull(); // 갱신되어 살아남음
    expect(cache.get('https://example.com/api-1.json')).toBeNull();     // 제거됨
  });
});
