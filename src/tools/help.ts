const TOOL_GUIDE = {
  tools: [
    {
      name: 'help',
      description: 'Show available tools and recommended workflow',
    },
    {
      name: 'add_project',
      description: 'Register a new OpenAPI service (projectId, name, source)',
    },
    {
      name: 'list_projects',
      description: 'List all registered services',
    },
    {
      name: 'list_services',
      description: 'List registered services with their API groups (tags)',
    },
    {
      name: 'list_apis',
      description: 'List all API endpoints for a service (serviceName)',
    },
    {
      name: 'describe_api',
      description: 'Get detailed info about a specific API endpoint (serviceName, path, method)',
    },
    {
      name: 'describe_component',
      description: 'Look up component schemas by $ref paths (serviceName, refs)',
    },
    {
      name: 'diff_apis',
      description: 'Compare current spec against a new source (serviceName, newSource)',
    },
  ],
  recommended_workflow: [
    '1. add_project — Register a service with its OpenAPI spec URL',
    '2. list_services — See all registered services and their API groups',
    '3. list_apis — Browse endpoints for a specific service',
    '4. describe_api — Get details about a specific endpoint',
    '5. describe_component — Drill into $ref schemas found in step 4',
  ],
};

export function createHelpTool() {
  return {
    help() {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(TOOL_GUIDE, null, 2) }],
      };
    },
  };
}
