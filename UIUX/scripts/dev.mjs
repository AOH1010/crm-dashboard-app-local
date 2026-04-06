import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, "..");

let shuttingDown = false;
const children = [];

function startProcess(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: projectDir,
    env: process.env,
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
  console.log(`[dev] started ${name}`);
}

function stopAll() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

startProcess("api", ["--experimental-sqlite", path.join(projectDir, "server", "index.js")]);
startProcess("vite", [path.join(projectDir, "node_modules", "vite", "bin", "vite.js"), "--port=3000", "--host=0.0.0.0"]);
