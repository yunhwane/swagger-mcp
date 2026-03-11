import type {
  NormalizedSnapshot,
  Endpoint,
  Schema,
  EndpointDiff,
  SchemaDiff,
  FieldChange,
  DiffSummary,
  SchemaObject,
} from './types';

export interface DiffOutput {
  endpoints: EndpointDiff[];
  schemas: SchemaDiff[];
  summary: DiffSummary;
}

export function diffSnapshots(
  oldSnap: NormalizedSnapshot,
  newSnap: NormalizedSnapshot,
): DiffOutput {
  const endpoints = diffEndpoints(oldSnap.endpoints, newSnap.endpoints);
  const schemas = diffSchemas(oldSnap.schemas, newSnap.schemas);

  const allDiffs = [...endpoints, ...schemas];
  const summary: DiffSummary = {
    added: allDiffs.filter((d) => d.changeType === 'added').length,
    removed: allDiffs.filter((d) => d.changeType === 'removed').length,
    modified: allDiffs.filter((d) => d.changeType === 'modified').length,
    breaking: allDiffs.filter((d) => d.breaking).length,
  };

  return { endpoints, schemas, summary };
}

function diffEndpoints(oldEps: Endpoint[], newEps: Endpoint[]): EndpointDiff[] {
  const oldMap = new Map(oldEps.map((e) => [e.key, e]));
  const newMap = new Map(newEps.map((e) => [e.key, e]));
  const diffs: EndpointDiff[] = [];

  // Removed endpoints
  for (const [key] of oldMap) {
    if (!newMap.has(key)) {
      diffs.push({ key, changeType: 'removed', breaking: true, details: [] });
    }
  }

  // Added endpoints
  for (const [key] of newMap) {
    if (!oldMap.has(key)) {
      diffs.push({ key, changeType: 'added', breaking: false, details: [] });
    }
  }

  // Modified endpoints
  for (const [key, oldEp] of oldMap) {
    const newEp = newMap.get(key);
    if (!newEp) continue;

    const details = diffEndpointDetails(oldEp, newEp);
    if (details.length > 0) {
      const breaking = details.some((d) => d.breaking);
      diffs.push({ key, changeType: 'modified', breaking, details });
    }
  }

  return diffs;
}

function diffEndpointDetails(oldEp: Endpoint, newEp: Endpoint): FieldChange[] {
  const changes: FieldChange[] = [];

  // Compare parameters
  const oldParams = new Map(oldEp.parameters.map((p) => [p.name, p]));
  const newParams = new Map(newEp.parameters.map((p) => [p.name, p]));

  for (const [name] of oldParams) {
    if (!newParams.has(name)) {
      changes.push({
        path: `parameters.${name}`,
        changeType: 'removed',
        breaking: true,
        oldValue: name,
      });
    }
  }

  for (const [name] of newParams) {
    if (!oldParams.has(name)) {
      const param = newParams.get(name)!;
      changes.push({
        path: `parameters.${name}`,
        changeType: 'added',
        breaking: param.required,
        newValue: name,
      });
    }
  }

  // Compare summary
  if (oldEp.summary !== newEp.summary) {
    changes.push({
      path: 'summary',
      changeType: 'modified',
      breaking: false,
      oldValue: oldEp.summary,
      newValue: newEp.summary,
    });
  }

  // Compare deprecated
  if (oldEp.deprecated !== newEp.deprecated) {
    changes.push({
      path: 'deprecated',
      changeType: 'modified',
      breaking: false,
      oldValue: oldEp.deprecated,
      newValue: newEp.deprecated,
    });
  }

  return changes;
}

function diffSchemas(oldSchemas: Schema[], newSchemas: Schema[]): SchemaDiff[] {
  const oldMap = new Map(oldSchemas.map((s) => [s.name, s]));
  const newMap = new Map(newSchemas.map((s) => [s.name, s]));
  const diffs: SchemaDiff[] = [];

  // Removed
  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      diffs.push({ name, changeType: 'removed', breaking: true, fieldChanges: [] });
    }
  }

  // Added
  for (const [name] of newMap) {
    if (!oldMap.has(name)) {
      diffs.push({ name, changeType: 'added', breaking: false, fieldChanges: [] });
    }
  }

  // Modified
  for (const [name, oldSchema] of oldMap) {
    const newSchema = newMap.get(name);
    if (!newSchema) continue;

    const fieldChanges = diffSchemaObjects(oldSchema.schema, newSchema.schema, '');
    if (fieldChanges.length > 0) {
      const breaking = fieldChanges.some((c) => c.breaking);
      diffs.push({ name, changeType: 'modified', breaking, fieldChanges });
    }
  }

  return diffs;
}

function diffSchemaObjects(
  oldSchema: SchemaObject,
  newSchema: SchemaObject,
  prefix: string,
): FieldChange[] {
  const changes: FieldChange[] = [];

  // Type change
  if (oldSchema.type !== newSchema.type) {
    changes.push({
      path: prefix ? `${prefix}.type` : 'type',
      changeType: 'modified',
      breaking: true,
      oldValue: oldSchema.type,
      newValue: newSchema.type,
    });
  }

  // Properties diff
  const oldProps = oldSchema.properties ?? {};
  const newProps = newSchema.properties ?? {};

  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      changes.push({
        path: prefix ? `${prefix}.${key}` : key,
        changeType: 'removed',
        breaking: true,
        oldValue: oldProps[key],
      });
    }
  }

  for (const key of Object.keys(newProps)) {
    if (!(key in oldProps)) {
      changes.push({
        path: prefix ? `${prefix}.${key}` : key,
        changeType: 'added',
        breaking: false,
        newValue: newProps[key],
      });
    }
  }

  // Recurse into shared properties
  for (const key of Object.keys(oldProps)) {
    if (key in newProps) {
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      const childChanges = diffSchemaObjects(oldProps[key]!, newProps[key]!, childPrefix);
      changes.push(...childChanges);
    }
  }

  // Required fields diff
  const oldRequired = new Set(oldSchema.required ?? []);
  const newRequired = new Set(newSchema.required ?? []);

  for (const field of newRequired) {
    if (!oldRequired.has(field)) {
      changes.push({
        path: prefix ? `${prefix}.required` : 'required',
        changeType: 'added',
        breaking: true,
        newValue: field,
      });
    }
  }

  for (const field of oldRequired) {
    if (!newRequired.has(field)) {
      changes.push({
        path: prefix ? `${prefix}.required` : 'required',
        changeType: 'removed',
        breaking: false,
        oldValue: field,
      });
    }
  }

  // Enum diff
  if (oldSchema.enum || newSchema.enum) {
    const oldEnum = oldSchema.enum ?? [];
    const newEnum = newSchema.enum ?? [];
    const oldSet = new Set(oldEnum.map(String));
    const newSet = new Set(newEnum.map(String));

    for (const val of oldSet) {
      if (!newSet.has(val)) {
        changes.push({
          path: prefix ? `${prefix}.enum` : 'enum',
          changeType: 'removed',
          breaking: true,
          oldValue: val,
        });
      }
    }

    for (const val of newSet) {
      if (!oldSet.has(val)) {
        changes.push({
          path: prefix ? `${prefix}.enum` : 'enum',
          changeType: 'added',
          breaking: false,
          newValue: val,
        });
      }
    }
  }

  return changes;
}
