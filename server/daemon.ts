// Daemon connection/auth resolution adapted from paseo-defer (MIT).
import type { Agent, Usage } from "../shared/policy.ts";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Short-lived daemon connections for the server runtime.
 *
 * The engine has no `paseo` handle (only RPC handlers get one) and needs
 * `provider.usage.list`, which the plugin SDK does not expose, so it talks to
 * the daemon directly. Each call opens and closes its own connection: a
 * long-lived reconnecting socket in this subprocess kept the event loop alive
 * and hung Paseo's "Stopping plugin" step, which wedged reload.
 */
const CONNECT_TIMEOUT_MS = 10_000;

export interface DaemonClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  fetchAgents(options?: { filter?: { includeArchived?: boolean }; page?: { limit: number; cursor?: string } }): Promise<{
    entries: readonly { agent: Agent }[];
    pageInfo?: { hasMore: boolean; nextCursor?: string | null };
  }>;
  fetchAgent(agentId: string): Promise<{ agent: Agent } | null>;
  listProviderUsage(): Promise<Usage>;
  setWorkspaceLabel?(options: { workspaceId: string; label: { name: string; color: "amber" }; assigned: boolean }): Promise<unknown>;
  invokePluginRpc?(pluginId: string, method: string, input: unknown): Promise<unknown>;
  getDaemonStatus?(): Promise<{ pid: number }>;
  listProviderSubagents?(agentId: string): Promise<{ subagents: readonly { status: string }[] }>;
  cancelAgent(agentId: string): Promise<void>;
  sendMessage(agentId: string, text: string, options?: { messageId: string; activeTurnBehavior: "steer" }): Promise<unknown>;
}

interface DaemonClientModule {
  DaemonClient: new (options: {
    url: string;
    clientId: string;
    clientType: string;
    reconnect: { enabled: boolean };
    connectTimeoutMs: number;
    suppressSendErrors: boolean;
    password?: string;
  }) => DaemonClient;
}

let daemonClientModule: DaemonClientModule | null = null;

/**
 * Borrows Paseo's own daemon client from the host at runtime.
 *
 * The specifier is assembled rather than written as a literal so the plugin
 * compiler cannot resolve it at build time. That matters for distribution:
 * `paseo plugin add` installs from Git and deliberately runs no package
 * manager, so a statically imported dependency makes the plugin fail to
 * compile with "Could not resolve". The plugin subprocess's `require` resolves
 * from the daemon's own module graph, which always carries the matching
 * @getpaseo/client, so borrowing it also removes any chance of a version skew
 * between the plugin's copy and the daemon's protocol.
 */
function loadDaemonClientModule(): DaemonClientModule {
  if (daemonClientModule !== null) return daemonClientModule;
  const specifier = ["@getpaseo", "client", "internal", "daemon-client"].join("/");
  try {
    daemonClientModule = require(specifier) as DaemonClientModule;
  } catch (error) {
    throw new Error(
      `This Paseo host does not expose its daemon client (${specifier}), which Session Guard needs: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return daemonClientModule;
}

let cachedUrl: string | null = null;

const VM_PASSWORD_FILE = join(homedir(), "paseo-hub", "secrets", "daemon-password");

async function readPasswordFile(path: string, required: boolean): Promise<string | undefined> {
  try {
    const password = (await readFile(path, "utf8")).trim();
    if (password !== "") return password;
    if (required) throw new Error("PASEO_PASSWORD_FILE is empty.");
    return undefined;
  } catch (error) {
    if (required) {
      if (error instanceof Error && error.message === "PASEO_PASSWORD_FILE is empty.") throw error;
      throw new Error("PASEO_PASSWORD_FILE could not be read.");
    }
    return undefined;
  }
}

/**
 * Resolve the daemon's plaintext password without ever reading the bcrypt hash
 * in config.json or including a secret in logs/errors. The standard Paseo env
 * wins; an explicit secret file is next; the paseo-vm secret is a final
 * zero-configuration fallback for plugin subprocesses on hub hosts.
 */
export async function resolvePassword(): Promise<string | undefined> {
  const fromEnv = process.env.PASEO_PASSWORD?.trim();
  if (fromEnv) return fromEnv;

  const configuredFile = process.env.PASEO_PASSWORD_FILE?.trim();
  if (configuredFile) return readPasswordFile(configuredFile, true);

  return readPasswordFile(VM_PASSWORD_FILE, false);
}

async function resolveUrl(): Promise<string> {
  if (cachedUrl !== null) return cachedUrl;
  const fromEnv = process.env.PASEO_DAEMON_URL;
  if (fromEnv !== undefined && fromEnv !== "") {
    cachedUrl = fromEnv;
    return cachedUrl;
  }
  const home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  let listen: string | undefined;
  try {
    const raw = JSON.parse(await readFile(join(home, "config.json"), "utf8")) as {
      daemon?: { listen?: string };
    };
    listen = raw.daemon?.listen;
  } catch {
    // Fall through to the documented default.
  }
  cachedUrl = `ws://${listen ?? "127.0.0.1:6767"}/ws`;
  return cachedUrl;
}

const activeClients = new Set<DaemonClient>();
let disposed = false;
export async function closeConnections(): Promise<void> {
  disposed = true;
  await Promise.allSettled([...activeClients].map(client => client.close()));
}

/** Runs `work` against a connection that is always closed before returning. */
export async function withDaemon<T>(work: (client: DaemonClient) => Promise<T>): Promise<T> {
  if (disposed) throw new Error("Session Guard is stopping.");
  const { DaemonClient } = loadDaemonClientModule();
  const password = await resolvePassword();
  const client = new DaemonClient({
    url: await resolveUrl(),
    clientId: "paseo-session-guard",
    clientType: "cli",
    reconnect: { enabled: false },
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    suppressSendErrors: true,
    ...(password === undefined ? {} : { password }),
  });
  if (disposed) throw new Error("Session Guard is stopping.");
  activeClients.add(client);
  try {
    await client.connect();
    return await work(client);
  } finally {
    activeClients.delete(client);
    try {
      await client.close();
    } catch {
      // Teardown must not mask the original result or error.
    }
  }
}
