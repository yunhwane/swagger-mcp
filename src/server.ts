import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { homedir } from 'os';
import { join } from 'path';
import { Registry } from './registry';
import { SpecCache } from './spec-cache';
import { SnapshotStore } from './snapshot-store';
import { createProjectTools, addProjectSchema } from './tools/project';
import {
  createCenterTools,
  listApisSchema,
  describeApiSchema,
  describeComponentSchema,
} from './tools/center';
import { createDiffTools, diffApisSchema } from './tools/diff';
import { createHelpTool } from './tools/help';

const BASE_DIR = join(homedir(), '.swagger-mcp');

export async function createMcpServer(): Promise<McpServer> {
  const registry = new Registry(BASE_DIR);
  await registry.load();

  const cache = new SpecCache();
  const snapshotStore = new SnapshotStore(BASE_DIR);
  const projectTools = createProjectTools(registry, snapshotStore);
  const centerTools = createCenterTools(registry, cache);
  const diffTools = createDiffTools(registry, cache, snapshotStore);
  const helpTool = createHelpTool();

  const server = new McpServer({
    name: 'swagger-mcp',
    version: '0.2.0',
  });

  // Help tool
  server.tool('help', 'Show available tools and recommended workflow', {}, () =>
    helpTool.help(),
  );

  // Project tools
  server.tool('add_project', 'Register a new OpenAPI service', addProjectSchema.shape, (args) =>
    projectTools.addProject(args),
  );
  server.tool('list_projects', 'List all registered services', {}, () =>
    projectTools.listProjects(),
  );

  // Center tools (4-step)
  server.tool('list_services', 'List registered services with API groups', {}, () =>
    centerTools.listServices(),
  );
  server.tool('list_apis', 'List APIs for a service (simplified)', listApisSchema.shape, (args) =>
    centerTools.listApis(args),
  );
  server.tool(
    'describe_api',
    'Get detailed info about a specific API endpoint',
    describeApiSchema.shape,
    (args) => centerTools.describeApi(args),
  );
  server.tool(
    'describe_component',
    'Look up component schemas by $ref paths',
    describeComponentSchema.shape,
    (args) => centerTools.describeComponent(args),
  );

  // Diff tool
  server.tool(
    'diff_apis',
    'Compare current spec of a registered service against a new source',
    diffApisSchema.shape,
    (args) => diffTools.diffApis(args),
  );

  return server;
}
