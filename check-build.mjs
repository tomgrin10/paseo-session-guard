// Model Paseo 0.10.1's dual-entry compiler, adapted from paseo-defer.
import { build } from "esbuild";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const external = ["@getpaseo/plugin", "@getpaseo/plugin/client", "@getpaseo/plugin/client/ui", "@getpaseo/plugin/client/react-native", "@getpaseo/plugin/server", "react", "react/jsx-runtime", "react-native", "zod"];
const temp = await mkdtemp(join(tmpdir(), "guard-build-"));
try {
  for (const path of ["index.client.tsx", "index.server.ts", "client", "server", "shared"]) await cp(path, join(temp, path), { recursive: true });
  for (const target of ["client", "server"]) {
    const result = await build({ entryPoints: [join(temp, `index.${target}.${target === "client" ? "tsx" : "ts"}`)], bundle: true, write: false, format: "cjs", platform: target === "server" ? "node" : "neutral", target: target === "server" ? "node20" : "es2020", external, metafile: true });
    for (const input of Object.keys(result.metafile.inputs)) {
      assert.ok(!input.includes(target === "client" ? "/server/" : "/client/"), `${target} bundle crossed the runtime boundary`);
    }
    if (target === "client") assert.ok(!Object.values(result.metafile.outputs).flatMap(o => o.imports).some(i => i.path.startsWith("node:")), "client bundle imports Node");
    await writeFile(join(temp, `${target}.cjs`), `module.exports=(require)=>{const module={exports:{}};const exports=module.exports;${result.outputFiles[0].text};return module.exports;};`);
    console.log(`${target}: compiles with no node_modules and respects runtime boundaries`);
  }
  const stub = `
    const assert=require('node:assert/strict');
    const requirePlugin=require('node:module').createRequire(${JSON.stringify(join(process.cwd(), "package.json"))});
    const z=requirePlugin('zod');
    const definitions={};
    const sdk={defineRpc:x=>x,defineSettings:x=>x,settingsRpc:id=>({read:{name:'settings.'+id+'.read'}})};
    const bundle=require('./server.cjs')(id=>id==='@getpaseo/plugin'?sdk:id==='zod'?z:requirePlugin(id));
    const cleanup=bundle.default({
      registerSettings:definition=>({read:async()=>({status:'ready',revision:'1',values:definition.schema.parse({enabled:false})}),subscribe:()=>()=>{}}),
      handle:(contract,handler)=>definitions[contract.name]=input=>handler(input,{paseo:{}}),
      on:()=>()=>{},
    });
    (async()=>{
      const result=await definitions['guard.status']({});
      assert.equal(result.policy.protectByDefault,true);
      assert.equal(result.error,null);
      await definitions['guard.protection']({agentId:'test',enabled:false});
      assert.equal((await definitions['guard.status']({})).overrides.test,false);
      await cleanup();
      assert.equal(require('node:fs').existsSync(require('node:path').join(process.env.PASEO_HOME,'plugin-data/session-guard/governor.lock')),false);
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  await writeFile(join(temp, "teardown.cjs"), stub);
  const child = spawnSync(process.execPath, [join(temp, "teardown.cjs")], { cwd: temp, env: { ...process.env, PASEO_HOME: join(temp, "home") }, timeout: 10_000, encoding: "utf8" });
  assert.equal(child.error, undefined, "cleanup left resources alive");
  assert.equal(child.status, 0, child.stderr);
  console.log("server: RPC round-trip, governor ownership, and subprocess teardown pass");
} finally { await rm(temp, { recursive: true, force: true }); }
