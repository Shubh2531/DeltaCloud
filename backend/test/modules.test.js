import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Loads every route and service module, so a missing import or a typo in wiring fails CI
// instead of failing on the server. Skipped when packages aren't installed.
const require = createRequire(import.meta.url);
let installed = true;
try {
  require.resolve("express");
  require.resolve("mongoose");
} catch {
  installed = false;
}

test("routes and services load", { skip: !installed && "packages not installed" }, async () => {
  for (const path of [
    "../src/routes/market.routes.js",
    "../src/routes/paper.routes.js",
    "../src/routes/news.routes.js",
    "../src/routes/intel.routes.js",
    "../src/routes/growth.routes.js",
    "../src/routes/account.routes.js",
    "../src/services/growth.js",
    "../src/services/passkeys.js",
    "../src/routes/auth.routes.js",
    "../src/services/prices.js",
    "../src/services/intel.js",
    "../src/services/stocks.js",
  ]) {
    const mod = await import(path);
    assert.ok(mod, path);
  }
  const { liveSnapshot } = await import("../src/services/prices.js");
  const snap = liveSnapshot();
  assert.ok(snap.prices && snap.mode);
  const { authenticationOptions, deviceName } = await import("../src/services/passkeys.js");
  const login = await authenticationOptions();
  assert.ok(login.options.challenge && login.challengeToken);
  assert.equal(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "iPhone");
  const { intelStatus } = await import("../src/services/intel.js");
  assert.equal(typeof intelStatus().ai, "boolean");
});
