import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2];

if (!["dev", "build"].includes(command)) {
  console.error("Usage: node scripts/run-tauri.mjs <dev|build>");
  process.exit(1);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargoTargetDir = path.join(rootDir, "src-tauri", "target");
const updaterKeyPath = path.join(rootDir, ".tauri", "clis-updater.key");
const tauriBin = process.platform === "win32"
  ? path.join(rootDir, "node_modules", ".bin", "tauri.cmd")
  : path.join(rootDir, "node_modules", ".bin", "tauri");
const signingEnv = fs.existsSync(updaterKeyPath)
  ? {
      TAURI_SIGNING_PRIVATE_KEY: fs.readFileSync(updaterKeyPath, "utf8"),
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
    }
  : {};

const child = spawn(tauriBin, [command], {
  cwd: rootDir,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: cargoTargetDir,
    ...signingEnv,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`tauri ${command} stopped by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
