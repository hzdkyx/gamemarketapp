import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(scriptsDir, "..");
const productionExe = join(
  desktopRoot,
  "release",
  "win-unpacked",
  "HzdKyx GameMarket Manager.exe",
);

if (!existsSync(productionExe)) {
  console.error(
    "Build empacotado nao encontrado. Rode `npm run dist` antes de `npm run start:production`.",
  );
  process.exit(1);
}

const child = spawn(productionExe, [], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});

child.unref();
