"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function referencedFiles() {
  const files = [manifest.background.service_worker];

  manifest.content_scripts.forEach((block) => files.push(...block.js));

  Object.values(manifest.icons || {}).forEach((file) => files.push(file));
  Object.values(manifest.action?.default_icon || {}).forEach((file) =>
    files.push(file)
  );

  if (manifest.action?.default_popup) {
    files.push(manifest.action.default_popup);
  }

  return Array.from(new Set(files));
}

test("every file the manifest points at exists", () => {
  for (const file of referencedFiles()) {
    assert.ok(
      fs.existsSync(path.join(root, file)),
      `manifest references ${file}, which is not in the repo`
    );
  }
});

test("the manifest and package versions agree", () => {
  assert.equal(manifest.version, pkg.version);
});

test("match_origin_as_fallback comes with a minimum Chrome version", () => {
  // The key is silently ignored before Chrome 119, which would leave webview
  // detection dead with no error anywhere.
  const usesFallback = manifest.content_scripts.some(
    (block) => block.match_origin_as_fallback
  );

  if (usesFallback) {
    assert.ok(Number(manifest.minimum_chrome_version) >= 119);
  }
});

test("detectors are loaded before the scripts that read them", () => {
  // content-top.js used to be injected by a block that loaded no detectors at
  // all, so its registry lookup could never resolve.
  for (const block of manifest.content_scripts) {
    const detectorIndexes = block.js
      .map((file, index) => (file.startsWith("detectors/") ? index : -1))
      .filter((index) => index !== -1);

    assert.ok(detectorIndexes.length > 0, `a block loads no detectors: ${block.js}`);

    const lastDetector = Math.max(...detectorIndexes);

    for (const entry of ["content-top.js", "content-frame.js"]) {
      const index = block.js.indexOf(entry);

      if (index !== -1) {
        assert.ok(index > lastDetector, `${entry} runs before its detectors`);
      }
    }
  }
});

test("each block loads the libraries its scripts require", () => {
  const requiredBy = {
    "content-top.js": [
      "lib/protocol.js",
      "lib/detector-kit.js",
      "lib/tab-title.js",
      "lib/state-machine.js",
      "lib/tab-controller.js"
    ],
    "content-frame.js": [
      "lib/protocol.js",
      "lib/detector-kit.js",
      "lib/watcher.js",
      "lib/frame-reporter.js"
    ],
    "lib/tab-controller.js": ["lib/protocol.js", "lib/state-machine.js"],
    "detectors/chatgpt.js": ["lib/detector-kit.js", "lib/vocab.js"]
  };

  for (const block of manifest.content_scripts) {
    for (const [script, dependencies] of Object.entries(requiredBy)) {
      if (!block.js.includes(script)) {
        continue;
      }

      for (const dependency of dependencies) {
        assert.ok(
          block.js.indexOf(dependency) !== -1 &&
            block.js.indexOf(dependency) < block.js.indexOf(script),
          `${script} needs ${dependency} loaded before it`
        );
      }
    }
  }
});

test("no host pattern is dead weight", () => {
  const patterns = manifest.content_scripts.flatMap((block) => block.matches);

  // *.app.github.dev is entirely covered by *.github.dev.
  assert.ok(!patterns.includes("https://*.app.github.dev/*"));

  // The Codespaces list page hosts no agent and no webview, so a renderer
  // there has nothing to render.
  assert.ok(!patterns.some((pattern) => pattern.startsWith("https://github.com/")));
});

test("every registered detector's hosts are covered by a match pattern", () => {
  // A detector whose host the manifest never injects on is silently dead.
  const detectorFiles = fs
    .readdirSync(path.join(root, "detectors"))
    .filter((file) => file.endsWith(".js"));

  const patterns = manifest.content_scripts.flatMap((block) => block.matches);

  for (const file of detectorFiles) {
    const detector = require(path.join(root, "detectors", file));

    for (const host of detector.hosts) {
      const bare = host.replace(/^\*\./, "");
      assert.ok(
        patterns.some((pattern) => pattern.includes(bare)),
        `${detector.id} claims ${host}, which no match pattern covers`
      );
    }
  }
});

test("only the workbench block injects into every frame", () => {
  // all_frames on a chat site would inject into its OAuth and payment iframes
  // for no benefit.
  for (const block of manifest.content_scripts) {
    if (!block.all_frames) {
      continue;
    }

    assert.ok(
      block.matches.every(
        (pattern) =>
          pattern.includes("github.dev") ||
          pattern.includes("vscode.dev") ||
          pattern.includes("vscode-cdn.net")
      ),
      `all_frames is set on a non-workbench block: ${block.matches}`
    );
  }
});

test("no permission is requested that the code does not use", () => {
  const permissions = manifest.permissions || [];

  assert.deepEqual(permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
});
