import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
async function tools(stubs = {}, read) {
  const bundle = await build({ entryPoints: ["server/native-tools.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "fixture-services", setup(build) { build.onResolve({ filter: /^\./ }, args => Object.hasOwn(stubs, args.path) ? { path: "fixture:" + args.path, external: true } : undefined); } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(id => id.startsWith("fixture:") ? stubs[id.slice(8)] : require(id), module, module.exports);
  let open;
  module.exports.contributeAgentTools({ before(name, handler) { assert.equal(name, "agent.session_open"); open = handler; return () => {}; } }, read);
  const request = { purpose: "interactive", provider: "claude", labels: {}, workspaceId: "w1", tools: [] };
  return { definitions: open({ request }).tools, module: module.exports };
}
const context = () => ({ agent: { id: "caller", workspaceId: "w1", provider: "claude", cwd: "/fixture", title: "Fixture" }, paseo: {}, signal: new AbortController().signal });
async function call(tool, input, ctx = context()) { return tool.execute(tool.input.parse(input), ctx); }
test("quota status resolves the caller identity without accepting an agent argument", async () => {
  let received;
  const { definitions } = await tools({}, async id => { received = id; return { protected: true }; });
  assert.throws(() => definitions[0].input.parse({ agentId: "other" }));
  assert.equal((await call(definitions[0], {})).structuredContent.protected, true); assert.equal(received, "caller");
});

test("a disabled host policy cannot claim that a session override protects work", async () => {
  const { module } = await tools({}, async () => ({}));
  assert.deepEqual(module.callerProtection(false, true, true), { enabled: false, protected: false, override: true });
  assert.equal(module.callerProtection(true, true, false).protected, false);
  assert.equal(module.callerProtection(true, false, true).protected, true);
});
