import type { ValidationResult } from "../types";

const ALLOWED_EXECUTABLES = new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "node",
  "deno",
  "bun",
  "cargo",
  "python",
  "python3",
  "py",
  "go",
  "java",
  "mvn",
  "mvnw",
  "gradle",
  "gradlew",
  "dotnet",
]);

const FORBIDDEN_PATTERNS = ["&&", "||", "|", ">", "<", ";", "`", "$(", "\n", "\r"];

function parseCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote === '"') {
      escaping = true;
      continue;
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (quote === char) {
      quote = null;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return quote ? [] : tokens;
}

function normalizeExecutable(executable: string): string {
  return executable
    .replace(/^\.?[\\/]/, "")
    .replace(/\.(cmd|bat|exe)$/i, "")
    .toLowerCase();
}

export function validateOnClient(cwd: string, command: string): ValidationResult {
  const trimmedCommand = command.trim();
  if (!cwd.trim()) {
    return { ok: false, message: "폴더를 지정해야 합니다.", args: [] };
  }
  if (!trimmedCommand) {
    return { ok: false, message: "실행 명령을 입력해야 합니다.", args: [] };
  }
  if (FORBIDDEN_PATTERNS.some((pattern) => trimmedCommand.includes(pattern))) {
    return {
      ok: false,
      message: "파이프, 리다이렉션, 명령 연결자는 허용하지 않습니다.",
      args: [],
    };
  }

  const tokens = parseCommandLine(trimmedCommand);
  if (!tokens.length) {
    return {
      ok: false,
      message: "따옴표가 닫히지 않았거나 실행 명령을 해석할 수 없습니다.",
      args: [],
    };
  }

  const executable = normalizeExecutable(tokens[0]);
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    return {
      ok: false,
      message: `${tokens[0]} 실행은 허용 목록에 없습니다.`,
      executable,
      args: tokens.slice(1),
    };
  }

  return { ok: true, message: "실행 가능", executable, args: tokens.slice(1) };
}
