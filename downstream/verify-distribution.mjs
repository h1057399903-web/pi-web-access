import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const source = "git:github.com/h1057399903-web/pi-web-access";
const bootstrapSha = "8f11a0a94988093b0ea5d725d18e8dcabacd2373";
const expectedStableSha = process.env.PI_EXPECTED_STABLE_SHA;
const piInstallRoot = resolve(
  process.env.PI_INSTALL_ROOT ?? join(process.cwd(), "..", "pi-plugin-workbench"),
);
const piCli = join(
  piInstallRoot,
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
  "dist",
  "cli.js",
);
const agentDir = mkdtempSync(join(tmpdir(), "pi-web-access-distribution-"));
const cloneDir = join(
  agentDir,
  "git",
  "github.com",
  "h1057399903-web",
  "pi-web-access",
);
const requiredCommands = ["websearch", "curator", "google-account", "search"];

if (!expectedStableSha) {
  throw new Error("PI_EXPECTED_STABLE_SHA must be the reviewed stable commit");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      PI_CODING_AGENT_DIR: agentDir,
      PI_OFFLINE: "1",
    },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function pi(...args) {
  return run(process.execPath, [piCli, ...args]);
}

function head() {
  return run("git", ["-C", cloneDir, "rev-parse", "HEAD"]);
}

function assertInstalledCommands(id) {
  const output = run(
    process.execPath,
    [
      piCli,
      "--mode",
      "rpc",
      "--no-session",
      "--no-context-files",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
    ],
    { input: `${JSON.stringify({ type: "get_commands", id })}\n` },
  );
  const events = output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const response = events.find((event) => event.id === id);
  if (!response?.success) {
    throw new Error(`Installed package did not start successfully: ${output}`);
  }
  const commands = (response.data?.commands ?? response.data ?? []).map(
    (command) => (typeof command === "string" ? command : command.name),
  );
  const missing = requiredCommands.filter((command) => !commands.includes(command));
  if (missing.length > 0) {
    throw new Error(`Installed package is missing commands: ${missing.join(", ")}`);
  }
}

try {
  pi("install", source);
  if (head() !== expectedStableSha) {
    throw new Error(`Fresh install did not resolve stable: ${head()}`);
  }
  assertInstalledCommands("fresh-stable");

  pi("update", "--extensions");
  if (head() !== expectedStableSha) {
    throw new Error(`Routine update moved away from stable: ${head()}`);
  }

  pi("install", `${source}@${bootstrapSha}`);
  if (head() !== bootstrapSha) {
    throw new Error(`Pinned rollback did not resolve bootstrap: ${head()}`);
  }

  pi("install", source);
  pi("update", "--extensions");
  if (head() !== expectedStableSha) {
    throw new Error(`Return to the moving stable lane failed: ${head()}`);
  }
  assertInstalledCommands("returned-stable");

  const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"));
  const packages = settings.packages ?? [];
  const configuredSources = packages.map((entry) =>
    typeof entry === "string" ? entry : entry.source,
  );
  if (!configuredSources.includes(source)) {
    throw new Error(`Unqualified stable source not persisted: ${JSON.stringify(packages)}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      source,
      stable: expectedStableSha,
      rollback: bootstrapSha,
      commands: requiredCommands,
      isolatedAgentDir: agentDir,
    }),
  );
} finally {
  if (process.env.PI_KEEP_DISPOSABLE_HOME !== "1") {
    rmSync(agentDir, { recursive: true, force: true });
  }
}
