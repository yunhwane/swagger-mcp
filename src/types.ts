// ── OpenAPI Normalized Types ──

export interface Endpoint {
  key: string;               // "GET /pets"
  method: string;            // "get"
  path: string;              // "/pets"
  summary?: string;
  description?: string;
  deprecated?: boolean;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseDef>;
  tags: string[];
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required: boolean;
  schema?: SchemaObject;
  description?: string;
  deprecated?: boolean;
}

export interface RequestBody {
  required: boolean;
  content: Record<string, MediaType>;
  description?: string;
}

export interface MediaType {
  schema?: SchemaObject;
}

export interface ResponseDef {
  description?: string;
  content?: Record<string, MediaType>;
}

export interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  enum?: unknown[];
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  description?: string;
  deprecated?: boolean;
  $ref?: string;
  additionalProperties?: boolean | SchemaObject;
  nullable?: boolean;
  [key: string]: unknown;
}

export interface Schema {
  name: string;
  schema: SchemaObject;
}

// ── Center Tool Types ──

export interface ApiOverviewEntry {
  tags: string[];
  operationId?: string;
  summary?: string;
}

export interface ApiDetail {
  parameters: Parameter[];
  requestBody?: SchemaObject;
  responses?: SchemaObject;
}

// ── Normalized Snapshot ──

export interface NormalizedSnapshot {
  endpoints: Endpoint[];
  schemas: Schema[];
  info: {
    title: string;
    version: string;
    description?: string;
  };
}

// ── Project & Snapshot ──

export interface Project {
  projectId: string;
  name: string;
  source: string;           // URL or file path
  sourceType?: 'url' | 'file';
  currentSnapshotId?: string | null;
  previousSnapshotId?: string | null;
  snapshotHistory?: SnapshotMeta[];
  createdAt: string;
  updatedAt: string;
}

export interface SnapshotMeta {
  snapshotId: string;
  sourceHash: string;
  version: string;
  endpointCount: number;
  schemaCount: number;
  createdAt: string;
}

export interface Snapshot {
  meta: SnapshotMeta;
  normalized: NormalizedSnapshot;
  rawContent: string;
}

// ── Diff Types ──

export interface DiffResult {
  projectId: string;
  from: SnapshotMeta;
  to: SnapshotMeta;
  summary: DiffSummary;
  endpoints: EndpointDiff[];
  schemas: SchemaDiff[];
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  breaking: number;
}

export interface EndpointDiff {
  key: string;
  changeType: 'added' | 'removed' | 'modified';
  breaking: boolean;
  details: FieldChange[];
}

export interface SchemaDiff {
  name: string;
  changeType: 'added' | 'removed' | 'modified';
  breaking: boolean;
  fieldChanges: FieldChange[];
}

export interface FieldChange {
  path: string;
  changeType: 'added' | 'removed' | 'modified';
  breaking: boolean;
  oldValue?: unknown;
  newValue?: unknown;
}

// ── Registry State ──

export interface RegistryState {
  projects: Record<string, Project>;
  activeProjectId: string | null;
}
