import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const frontendDir = path.join(repoRoot, "apps", "frontend");
const backendDir = path.join(repoRoot, "apps", "backend");
const stateDir = path.join(repoRoot, ".local-development");
const statePath = path.join(stateDir, "runtime.json");
const npmExecPath = process.env.npm_execpath;

let shuttingDown = false;
const children = [];

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 100; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`Could not find a free port near ${preferredPort}.`);
}

function startProcess(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const otherChild of children) {
      if (otherChild !== child && !otherChild.killed) {
        otherChild.kill();
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  children.push(child);
  console.log(`[local-stack] started ${name}`);
  return child;
}

function stopAll() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  try {
    if (fs.existsSync(statePath)) {
      fs.rmSync(statePath, { force: true });
    }
  } catch {
    // Best effort cleanup for the runtime state file.
  }
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

if (!npmExecPath) {
  throw new Error("npm_execpath is missing. Start local dev with `npm run dev` from the repo root.");
}

const frontendPreferredPort = Number.parseInt(process.env.CRM_FRONTEND_PORT || "3000", 10);
const backendPreferredPort = Number.parseInt(process.env.CRM_BACKEND_PORT || "3001", 10);
const backendPort = await findFreePort(backendPreferredPort);
const frontendPortSeed = backendPort === frontendPreferredPort ? frontendPreferredPort + 1 : frontendPreferredPort;
const frontendPort = await findFreePort(frontendPortSeed);

console.log(`[local-stack] frontend: http://127.0.0.1:${frontendPort}`);
console.log(`[local-stack] backend:  http://127.0.0.1:${backendPort}`);

fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(
  statePath,
  JSON.stringify(
    {
      pid: process.pid,
      frontendPort,
      backendPort,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

const backendProcess = startProcess(
  "backend",
  process.execPath,
  [npmExecPath, "run", "dev"],
  backendDir,
  {
    ...process.env,
    PORT: String(backendPort),
    DASHBOARD_API_PORT: String(backendPort),
    CRM_BACKEND_PORT: String(backendPort),
  },
);

const frontendProcess = startProcess(
  "frontend",
  process.execPath,
  [npmExecPath, "run", "dev", "--", "--port", String(frontendPort), "--host", "0.0.0.0"],
  frontendDir,
  {
    ...process.env,
    CRM_BACKEND_PORT: String(backendPort),
    DASHBOARD_API_PORT: String(backendPort),
  },
);

fs.writeFileSync(
  statePath,
  JSON.stringify(
    {
      pid: process.pid,
      frontendPid: frontendProcess.pid,
      backendPid: backendProcess.pid,
      frontendPort,
      backendPort,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
