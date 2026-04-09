import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const mode = process.argv[2] || "root";

const rootTargets = [
  path.join(repoRoot, ".local-development"),
  path.join(repoRoot, ".vercel"),
  path.join(repoRoot, "node_modules", ".vite-temp"),
];

const frontendTargets = [
  path.join(repoRoot, "apps", "frontend", "dist"),
  path.join(repoRoot, "apps", "frontend", "node_modules", ".vite"),
  path.join(repoRoot, "apps", "frontend", "node_modules", ".vite-temp"),
];

const targets = mode === "frontend" ? frontendTargets : [...rootTargets, ...frontendTargets];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
}

console.log(`[clean] removed ${targets.length} target(s).`);
