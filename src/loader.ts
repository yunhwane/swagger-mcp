import { readFile } from 'fs/promises';
import YAML from 'yaml';

export interface LoadResult {
  doc: Record<string, unknown>;
  raw: string;
}

export async function loadSpec(source: string): Promise<LoadResult> {
  let raw: string;

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${source}: ${res.status} ${res.statusText}`);
    }
    raw = await res.text();
  } else {
    raw = await readFile(source, 'utf-8');
  }

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(raw);
  } catch {
    // Try YAML
    try {
      doc = YAML.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse ${source} as JSON or YAML`);
    }
  }

  // Validate OpenAPI version
  const version = doc.openapi as string | undefined;
  if (!version || !version.startsWith('3.')) {
    throw new Error(
      `Unsupported spec: expected OpenAPI 3.x, got ${doc.swagger ? `Swagger ${doc.swagger}` : version ?? 'unknown'}`,
    );
  }

  return { doc, raw };
}
