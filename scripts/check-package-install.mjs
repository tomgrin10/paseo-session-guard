import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "guard-npm-install-"));
let daemon;
let registry;
try {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const packed = JSON.parse((await exec("npm", ["pack", "--json", "--pack-destination", root], { timeout: 30_000 })).stdout)[0];
  const tarball = await readFile(join(root, packed.filename));
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  let registryUrl;
  registry = createServer((request, response) => {
    if (request.url?.endsWith(".tgz")) {
      response.setHeader("Content-Type", "application/octet-stream");
      response.end(tarball);
    } else if (request.url?.split("?")[0] === `/${pkg.name}`) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ name: pkg.name, "dist-tags": { latest: pkg.version }, versions: { [pkg.version]: { ...pkg, dist: { integrity, tarball: `${registryUrl}/${pkg.name}/-/${packed.filename}` } } } }));
    } else { response.statusCode = 404; response.end("Not found"); }
  });
  await new Promise(resolve => registry.listen(0, "127.0.0.1", resolve));
  registryUrl = `http://127.0.0.1:${registry.address().port}`;
  const home = join(root, "home");
  await mkdir(home);
  await writeFile(join(home, "config.json"), JSON.stringify({ pluginsEnabled: true, daemon: { listen: "127.0.0.1:0", relay: { enabled: false }, mcp: { enabled: false }, browserTools: { enabled: false } } }));
  const userconfig = join(root, "npmrc");
  await writeFile(userconfig, "");
  const env = { ...process.env, PASEO_HOME: home, PASEO_RELAY_ENABLED: "false", NPM_CONFIG_REGISTRY: registryUrl, NPM_CONFIG_USERCONFIG: userconfig };
  for (const key of ["PASEO_DAEMON_URL", "PASEO_PASSWORD", "PASEO_PASSWORD_FILE", "PASEO_AGENT_ID", "PASEO_AGENT_CWD", "PASEO_WORKSPACE_ID", "CODEX_THREAD_ID", "CODEX_SESSION_ID", "CLAUDE_SESSION_ID", "NODE_AUTH_TOKEN", "NPM_TOKEN"]) delete env[key];
  const cli = async (...args) => JSON.parse((await exec("paseo", ["--home", home, "--json", ...args], { env, timeout: 120_000, maxBuffer: 1024 * 1024 })).stdout);
  daemon = spawn("paseo", ["daemon", "run", "--home", home], { env, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await cli("workspace", "ls"); ready = true; break; }
    catch { assert.equal(daemon.exitCode, null, "isolated daemon exited during startup"); await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, "isolated daemon did not start");
  await cli("plugin", "install", pkg.name);
  const plugin = (await cli("plugin", "ls", "paseo-session-guard"))[0];
  assert.equal(plugin.status, "running");
  assert.equal(plugin.installation.identity.kind, "npm");
  assert.equal(plugin.installation.currentRevision, pkg.version);
  const modules = join(plugin.path, "node_modules");
  await assert.rejects(readFile(join(modules, "@getpaseo/client/package.json")), { code: "ENOENT" });
  console.log("npm: bare package-name install compiles and runs in an isolated daemon without development dependencies");
} finally {
  if (daemon && daemon.exitCode === null) {
    daemon.kill("SIGTERM");
    await new Promise(resolve => {
      const timer = setTimeout(() => { daemon.kill("SIGKILL"); resolve(); }, 5000);
      daemon.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  }
  if (registry) { registry.closeAllConnections(); await new Promise(resolve => registry.close(resolve)); }
  await rm(root, { recursive: true, force: true });
}
