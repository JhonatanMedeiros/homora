import { describe, expect, it } from 'vitest';
import { buildSnippet, FOLDER_PLACEHOLDER, TOKEN_PLACEHOLDER } from './connect-snippets';

describe('buildSnippet', () => {
  it('uses placeholders until the token and folder are known', () => {
    const { text } = buildSnippet('claude-code', {});
    expect(text).toContain(`HOMORA_AGENT_TOKEN=${TOKEN_PLACEHOLDER}`);
    expect(text).toContain(`${FOLDER_PLACEHOLDER}/apps/backend/dist/mcp-server.js`);
    expect(text).toContain(`HOMORA_DATABASE_PATH=${FOLDER_PLACEHOLDER}/data/homora.sqlite`);
  });

  it('builds a Claude Code command with the token and one option between --env and the name', () => {
    const { text } = buildSnippet('claude-code', { token: 'abc_DEF-123', folder: '/srv/homora/' });
    expect(text).toContain('claude mcp add --transport stdio');
    expect(text).toContain('--env HOMORA_AGENT_TOKEN=abc_DEF-123');
    expect(text).toContain('homora -- node /srv/homora/apps/backend/dist/mcp-server.js');
  });

  it('quotes shell words that contain spaces', () => {
    const { text } = buildSnippet('claude-code', { token: 't', folder: "/home/ana/my homora's" });
    expect(text).toContain("'/home/ana/my homora'\\''s/apps/backend/dist/mcp-server.js'");
  });

  it('builds Codex TOML with an env table', () => {
    const { text, file } = buildSnippet('codex', { token: 'tok', folder: '/srv/homora' });
    expect(file).toBe('~/.codex/config.toml');
    expect(text).toContain('[mcp_servers.homora]');
    expect(text).toContain('command = "node"');
    expect(text).toContain('[mcp_servers.homora.env]');
    expect(text).toContain('HOMORA_AGENT_TOKEN = "tok"');
  });

  it("uses each client's own JSON shape", () => {
    const parse = (client: Parameters<typeof buildSnippet>[0]) =>
      JSON.parse(buildSnippet(client, { token: 'tok', folder: '/srv/homora' }).text);
    expect(parse('claude-desktop').mcpServers.homora.env.HOMORA_AGENT_TOKEN).toBe('tok');
    expect(parse('cursor').mcpServers.homora.type).toBe('stdio');
    expect(parse('vscode').servers.homora).toMatchObject({ type: 'stdio', command: 'node' });
    expect(parse('generic').args).toEqual(['/srv/homora/apps/backend/dist/mcp-server.js']);
  });

  it('keeps Windows separators and escapes them in JSON', () => {
    const { text } = buildSnippet('claude-desktop', { token: 't', folder: 'C:\\homora' });
    expect(JSON.parse(text).mcpServers.homora.args[0]).toBe(
      'C:\\homora\\apps\\backend\\dist\\mcp-server.js',
    );
  });
});
