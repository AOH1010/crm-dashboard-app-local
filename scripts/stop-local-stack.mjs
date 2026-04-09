import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const statePath = path.join(repoRoot, ".local-development", "runtime.json");

function stopPid(pid, label) {
  if (!Number.isFinite(pid)) {
    return;
  }
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
    console.log(`[local-stack] stopped ${label} pid ${pid}`);
  } catch {
    console.log(`[local-stack] ${label} pid ${pid} was not running.`);
  }
}

function findPidsListeningOnPort(port) {
  if (process.platform !== "win32") {
    return [];
  }
  try {
    const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
    return Array.from(
      new Set(
        output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.includes(`:${port}`) && line.includes("LISTENING"))
          .map((line) => Number.parseInt(line.split(/\s+/).at(-1) || "", 10))
          .filter((pid) => Number.isFinite(pid)),
      ),
    );
  } catch {
    return [];
  }
}

const defaultPorts = [3000, 3001];
const extraPorts = [];

if (fs.existsSync(statePath)) {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  stopPid(Number.parseInt(String(state.frontendPid || ""), 10), "frontend");
  stopPid(Number.parseInt(String(state.backendPid || ""), 10), "backend");
  stopPid(Number.parseInt(String(state.pid || ""), 10), "stack");

  if (state.frontendPort) {
    extraPorts.push(Number.parseInt(String(state.frontendPort), 10));
  }
  if (state.backendPort) {
    extraPorts.push(Number.parseInt(String(state.backendPort), 10));
  }

  fs.rmSync(statePath, { force: true });
}

for (const port of [...new Set([...defaultPorts, ...extraPorts])]) {
  for (const pid of findPidsListeningOnPort(port)) {
    stopPid(pid, `port-${port}`);
  }
}

if (!fs.existsSync(statePath)) {
  console.log("[local-stack] stop check complete.");
}
