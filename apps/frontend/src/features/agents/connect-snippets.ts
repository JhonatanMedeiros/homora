/** Ready-to-copy MCP setup for each client that can run Homora's stdio server. */
export type ClientId = 'claude-code' | 'codex' | 'claude-desktop' | 'cursor' | 'vscode' | 'generic';

export const CLIENTS: { id: ClientId; label: string }[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'generic', label: 'JSON' },
];

export const TOKEN_PLACEHOLDER = 'COLE_O_TOKEN_AQUI';
export const FOLDER_PLACEHOLDER = '/caminho/do/homora';

type Input = { token?: string; folder?: string };
export type Snippet = {
  /** Where the text goes (a file path), when it is a file rather than a command. */
  file?: string;
  /** The text to copy. */
  text: string;
};

const join = (folder: string, ...parts: string[]) => {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return [folder.replace(/[\\/]+$/, ''), ...parts].join(sep);
};

/** Single-quotes a shell word only when it needs it. */
const sh = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;

const json = (value: unknown) => JSON.stringify(value, null, 2);

export function buildSnippet(client: ClientId, { token, folder }: Input): Snippet {
  const root = folder?.trim() || FOLDER_PLACEHOLDER;
  const script = join(root, 'apps', 'backend', 'dist', 'mcp-server.js');
  const database = join(root, 'data', 'homora.sqlite');
  const env = {
    HOMORA_AGENT_TOKEN: token || TOKEN_PLACEHOLDER,
    HOMORA_DATABASE_PATH: database,
  };
  switch (client) {
    case 'claude-code':
      return {
        text: [
          'claude mcp add --transport stdio \\',
          `  --env HOMORA_AGENT_TOKEN=${sh(env.HOMORA_AGENT_TOKEN)} \\`,
          `  --env HOMORA_DATABASE_PATH=${sh(env.HOMORA_DATABASE_PATH)} \\`,
          `  homora -- node ${sh(script)}`,
        ].join('\n'),
      };
    case 'codex':
      return {
        file: '~/.codex/config.toml',
        text: [
          '[mcp_servers.homora]',
          'command = "node"',
          `args = [${JSON.stringify(script)}]`,
          '',
          '[mcp_servers.homora.env]',
          `HOMORA_AGENT_TOKEN = ${JSON.stringify(env.HOMORA_AGENT_TOKEN)}`,
          `HOMORA_DATABASE_PATH = ${JSON.stringify(env.HOMORA_DATABASE_PATH)}`,
        ].join('\n'),
      };
    case 'claude-desktop':
      return {
        file: 'claude_desktop_config.json',
        text: json({ mcpServers: { homora: { command: 'node', args: [script], env } } }),
      };
    case 'cursor':
      return {
        file: '~/.cursor/mcp.json',
        text: json({
          mcpServers: { homora: { type: 'stdio', command: 'node', args: [script], env } },
        }),
      };
    case 'vscode':
      return {
        file: '.vscode/mcp.json',
        text: json({
          servers: { homora: { type: 'stdio', command: 'node', args: [script], env } },
        }),
      };
    default:
      return { text: json({ command: 'node', args: [script], env }) };
  }
}
