#!/usr/bin/env node
/*
 * Builds the Chrome Web Store upload: dist/agent-tab-lights-v<version>.zip
 *
 * Ships from an explicit allowlist rather than excluding things, so the default
 * for a new file is "not shipped". Zipping the working tree would otherwise put
 * tests/, tools/ and the dev docs in front of a store reviewer.
 *
 * Three gates, each fatal - this is also the project's lint step, since there
 * is no linter and a syntax error in a file that only ever loads in the browser
 * would otherwise reach users.
 *
 * Run with: npm run package
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");

function fail(message) {
  process.stderr.write(`package: ${message}\n`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(readFileSync(join(root, file), "utf8"));
}

function filesIn(directory, extension) {
  return readdirSync(join(root, directory))
    .filter((file) => file.endsWith(extension))
    .sort()
    .map((file) => `${directory}/${file}`);
}

// ------------------------------------------------------------------ manifest

const manifest = readJson("manifest.json");
const pkg = readJson("package.json");
const version = manifest.version;

// Gate 1: a version mismatch would ship a build whose store listing, tag and
// changelog all disagree with each other.
if (manifest.version !== pkg.version) {
  fail(
    `version mismatch: manifest.json is ${manifest.version}, package.json is ${pkg.version}`
  );
}

// -------------------------------------------------------------- the allowlist

const ALLOWLIST = [
  "manifest.json",
  "background.js",
  "content-top.js",
  "content-frame.js",
  "LICENSE",
  ...filesIn("lib", ".js"),
  ...filesIn("detectors", ".js"),
  ...filesIn("popup", ".html"),
  ...filesIn("popup", ".css"),
  ...filesIn("popup", ".js"),
  ...filesIn("icons", ".png")
];

const missing = ALLOWLIST.filter((file) => !existsSync(join(root, file)));

if (missing.length) {
  fail(`allowlisted files are missing: ${missing.join(", ")}`);
}

// ------------------------------------------------------------------- gate 2

// Every path the manifest names has to exist AND be shipped. This catches the
// likeliest future packaging bug by far: adding a detector to the manifest and
// forgetting that the zip is built from a list.
const referenced = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((block) => block.js),
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  manifest.action?.default_popup
].filter(Boolean);

for (const file of new Set(referenced)) {
  if (!existsSync(join(root, file))) {
    fail(`manifest references ${file}, which does not exist`);
  }

  if (!ALLOWLIST.includes(file)) {
    fail(`manifest references ${file}, which the package allowlist omits`);
  }
}

// The popup is loaded as a page, so its <script src> tags are references the
// manifest cannot see.
const popupHtml = readFileSync(join(root, "popup/popup.html"), "utf8");

for (const match of popupHtml.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const target = match[1];

  if (target.startsWith("http")) {
    continue;
  }

  const resolved = relative(root, join(root, "popup", target));

  if (!ALLOWLIST.includes(resolved)) {
    fail(`popup.html loads ${resolved}, which the package allowlist omits`);
  }
}

// ------------------------------------------------------------------- gate 3

for (const file of ALLOWLIST.filter((name) => name.endsWith(".js"))) {
  try {
    execFileSync(process.execPath, ["--check", join(root, file)], {
      stdio: "pipe"
    });
  } catch (error) {
    fail(`syntax error in ${file}:\n${error.stderr?.toString() || error.message}`);
  }
}

// ---------------------------------------------------------------------- build

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const zipName = `agent-tab-lights-v${version}.zip`;

// -X drops platform extras (uid/gid, extended attributes) that vary per
// machine and that the store has no use for.
execFileSync("zip", ["-X", "-q", join(distDir, zipName), ...ALLOWLIST], {
  cwd: root
});

const bytes = statSync(join(distDir, zipName)).size;

process.stdout.write(
  `built dist/${zipName} (${ALLOWLIST.length} files, ${(bytes / 1024).toFixed(1)} kB)\n`
);
