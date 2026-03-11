# Prompts 사용 가이드

swagger-mcp는 10개의 **Tools** 외에 5개의 **Prompts**를 제공한다. Prompts는 여러 도구를 조합하는 워크플로우를 템플릿화하여, 사용자가 도구를 직접 조합할 필요 없이 한 번의 선택으로 복잡한 작업을 수행할 수 있게 한다.

---

## MCP 설정

### Claude Desktop

`claude_desktop_config.json`에 다음을 추가한다:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "node",
      "args": ["/path/to/swagger-mcp/dist/index.js"]
    }
  }
}
```

### Claude Code

프로젝트 루트의 `.mcp.json`:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "node",
      "args": ["/path/to/swagger-mcp/dist/index.js"]
    }
  }
}
```

설정 후 MCP 클라이언트를 재시작하면 Tools와 Prompts가 모두 노출된다.

---

## Prompts 목록

| Prompt | 설명 | 주요 인자 |
|--------|------|-----------|
| `onboard-api` | 새 API 스펙 등록 및 탐색 가이드 | `source` (필수), `name` |
| `explore-api` | API 도메인/리소스/관계 구조 파악 | `projectId`, `focus` |
| `review-api-changes` | 두 버전 간 변경사항 구조적 리뷰 | `projectId` |
| `breaking-change-analysis` | 브레이킹 체인지 영향 범위 심층 분석 | `projectId`, `fromSnapshotId`, `toSnapshotId` |
| `migration-guide` | API 변경에 대한 마이그레이션 문서 생성 | `projectId`, `fromSnapshotId`, `toSnapshotId` |

---

## 사용 예시

### 1. onboard-api — 새 API 온보딩

**시나리오**: 팀에서 새로운 API 문서를 처음 등록하고 살펴보고 싶다.

Claude Desktop에서 프롬프트 목록 중 `onboard-api`를 선택하고 인자를 입력한다:

```
source: https://petstore3.swagger.io/api/v3/openapi.json
name: Petstore
```

그러면 다음 워크플로우가 자동으로 가이드된다:

1. `add_project` — 프로젝트 등록 (`Petstore`, URL 소스)
2. `sync_project` — 스펙 로드 및 스냅샷 생성
3. `search_docs` — 주요 리소스와 엔드포인트 탐색
4. `describe_endpoint` — 핵심 엔드포인트 상세 확인

**Claude Code에서 직접 호출하는 경우:**

> "Petstore API를 온보딩해줘. 스펙 URL은 https://petstore3.swagger.io/api/v3/openapi.json 이야."

Claude가 `onboard-api` 프롬프트를 활용하여 단계별로 실행한다.

---

### 2. explore-api — API 탐색

**시나리오**: 등록된 API의 전체 구조를 파악하고 싶다.

```
projectId: petstore
focus: pet management
```

가이드되는 워크플로우:

1. `search_docs` — "pet management" 관련 엔드포인트/스키마 검색
2. `describe_endpoint` — 주요 엔드포인트 상세 분석
3. `describe_schema` — 핵심 데이터 모델 구조 파악
4. `trace_schema_usage` — 스키마 간 관계 추적

**결과 예시:**

> **Pet Management 도메인 분석**
>
> - **엔드포인트**: `POST /pet`, `GET /pet/{petId}`, `PUT /pet`, `DELETE /pet/{petId}`, `GET /pet/findByStatus`
> - **핵심 스키마**: `Pet` (id, name, category, photoUrls, tags, status)
> - **관계**: `Pet` → `Category`, `Pet` → `Tag` (1:N)
> - `Pet` 스키마는 5개 엔드포인트에서 request/response body로 사용됨

---

### 3. review-api-changes — API 변경 리뷰

**시나리오**: API 스펙이 업데이트되어 변경사항을 리뷰하고 싶다.

```
projectId: petstore
```

가이드되는 워크플로우:

1. `sync_project` — 최신 스펙 동기화 (새 스냅샷 생성)
2. `diff_project` — 이전 버전과 비교
3. `describe_endpoint` — 변경된 엔드포인트 상세 확인
4. `describe_schema` — 변경된 스키마 상세 확인

**결과 예시:**

> **API 변경 리뷰 (v1 → v2)**
>
> **Added**
> - `POST /pet/{petId}/uploadImage` — 펫 이미지 업로드
>
> **Modified**
> - `GET /pet/{petId}` — 응답에 `vaccinated` 필드 추가
> - `Pet` 스키마 — `vaccinated: boolean` 필드 추가 (optional)
>
> **Breaking Changes**: 없음

---

### 4. breaking-change-analysis — 브레이킹 체인지 분석

**시나리오**: 스펙 변경에 브레이킹 체인지가 있어 영향 범위를 파악해야 한다.

```
projectId: petstore
fromSnapshotId: snap-abc123
toSnapshotId: snap-def456
```

가이드되는 워크플로우:

1. `diff_project` (breakingOnly: true) — 브레이킹 체인지만 추출
2. `trace_schema_usage` — 변경된 스키마가 사용되는 모든 엔드포인트 추적
3. `describe_endpoint` — 영향받는 엔드포인트 상세 확인

**결과 예시:**

> **Breaking Change Impact Analysis**
>
> | 변경 | 타입 | 심각도 | 영향 엔드포인트 |
> |------|------|--------|----------------|
> | `Pet.name` 필드 삭제 | field-removed | CRITICAL | `POST /pet`, `PUT /pet`, `GET /pet/{petId}` |
> | `GET /pet/findByTags` 엔드포인트 삭제 | endpoint-removed | HIGH | — |
>
> **권장 조치:**
> - `Pet.name` 삭제: 모든 Pet 생성/수정 API 호출부에서 `name` 필드 제거 필요
> - `findByTags` 삭제: `findByStatus`로 대체하거나 별도 필터링 로직 구현

---

### 5. migration-guide — 마이그레이션 가이드 생성

**시나리오**: API 버전 업그레이드에 대한 개발자용 마이그레이션 문서가 필요하다.

```
projectId: petstore
fromSnapshotId: snap-abc123
toSnapshotId: snap-def456
```

가이드되는 워크플로우:

1. `list_snapshots` — 비교 대상 버전 확인
2. `diff_project` — 전체 변경사항 파악
3. `describe_endpoint` — 변경된 엔드포인트 before/after 비교
4. `describe_schema` — 변경된 스키마 구조 비교
5. `trace_schema_usage` — 변경 영향 범위 추적

**생성되는 문서 구조:**

> # Petstore API Migration Guide (v1 → v2)
>
> ## 1. Overview
> - 변경 엔드포인트: 3개 (추가 1, 수정 1, 삭제 1)
> - 변경 스키마: 2개
> - 브레이킹 체인지: 2건
> - 예상 마이그레이션 난이도: 중간
>
> ## 2. Breaking Changes
> ### `Pet.name` 필드 삭제
> **Before:**
> ```json
> { "id": 1, "name": "doggie", "status": "available" }
> ```
> **After:**
> ```json
> { "id": 1, "status": "available" }
> ```
> **Fix:** `Pet` 객체에서 `name` 필드 참조를 모두 제거
>
> ## 3. New Features
> - `POST /pet/{petId}/uploadImage` — 펫 이미지 업로드 지원
>
> ## 4. Step-by-Step Migration
> - [ ] `Pet.name` 필드 참조 제거
> - [ ] `GET /pet/findByTags` 호출을 `GET /pet/findByStatus`로 교체
> - [ ] 새 `uploadImage` 엔드포인트 연동 (선택)

---

## Tools vs Prompts 비교

| 구분 | Tools | Prompts |
|------|-------|---------|
| **역할** | 단일 작업 수행 | 여러 도구를 조합한 워크플로우 |
| **호출** | LLM이 직접 호출 | 사용자가 UI에서 선택 |
| **상태** | 서버 상태 변경 가능 | 순수 텍스트 템플릿 (상태 없음) |
| **예시** | `describe_endpoint` | `explore-api` (내부에서 4개 도구 활용) |

Prompts는 도구를 **직접 호출하지 않는다**. 대신 LLM에게 "이 순서로 이 도구들을 사용하라"는 가이드를 제공하며, LLM이 실제 도구 호출을 수행한다.

---

## MCP Inspector로 테스트

개발 중 프롬프트가 정상 등록되었는지 확인하려면 MCP Inspector를 사용한다:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Inspector UI에서:
1. **Prompts** 탭 클릭 → 5개 프롬프트가 목록에 나타나는지 확인
2. 프롬프트 선택 → 인자 입력 → **Get Prompt** 클릭
3. 반환된 메시지에 올바른 워크플로우 가이드가 포함되는지 확인

---

## 프로그래밍 방식 호출 (MCP 프로토콜)

MCP 클라이언트에서 프롬프트를 프로그래밍 방식으로 호출할 수도 있다:

### prompts/list — 프롬프트 목록 조회

```json
// Request
{ "method": "prompts/list" }

// Response
{
  "prompts": [
    {
      "name": "onboard-api",
      "title": "Onboard API",
      "description": "Step-by-step guide to register, sync, and explore a new API spec",
      "arguments": [
        { "name": "source", "required": true, "description": "URL or file path to the OpenAPI spec" },
        { "name": "name", "required": false, "description": "Display name for the project" }
      ]
    },
    {
      "name": "explore-api",
      "title": "Explore API",
      "description": "Structurally explore an API's domains, resources, and relationships",
      "arguments": [
        { "name": "projectId", "required": false },
        { "name": "focus", "required": false }
      ]
    }
    // ... 3개 더
  ]
}
```

### prompts/get — 프롬프트 실행

```json
// Request
{
  "method": "prompts/get",
  "params": {
    "name": "onboard-api",
    "arguments": {
      "source": "https://petstore3.swagger.io/api/v3/openapi.json",
      "name": "Petstore"
    }
  }
}

// Response
{
  "messages": [
    {
      "role": "user",
      "content": {
        "type": "text",
        "text": "I want to onboard a new API spec. Please guide me through the following steps:\n\n## Step 1: Register the project\nUse `add_project` to register this API:\n- **source**: `https://petstore3.swagger.io/api/v3/openapi.json`\n- **sourceType**: `url`\n- **name**: `Petstore`\n\n## Step 2: Sync the spec\nUse `sync_project` to load and snapshot the spec.\n\n## Step 3: Explore the API\nUse `search_docs` to discover the main resources and endpoints.\n\n## Step 4: Inspect key endpoints\nUse `describe_endpoint` to get details on the most important endpoints.\n\nPlease execute each step and summarize what you find."
      }
    }
  ]
}
```
