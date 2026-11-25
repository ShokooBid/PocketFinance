// PreToolUse guard for Bash/PowerShell. Blocks commands that irreversibly destroy
// local PocketFinance data (see DEVELOPMENT.md). Exit 2 = block; reason goes to Claude.
// To run one of these intentionally, run it yourself in a terminal.
import process from "node:process";

const rules = [
  [
    /docker(-compose|\s+compose)\b[^\n]*\bdown\b[^\n]*(\s-v\b|--volumes)/i,
    "`docker compose down --volumes` permanently deletes the local PostgreSQL volume."
  ],
  [
    /docker\s+volume\s+(rm|prune)\b/i,
    "Removing Docker volumes can delete the local database."
  ],
  [
    /prisma\s+migrate\s+reset\b|--force-reset\b/i,
    "Prisma reset drops all data in the target database."
  ],
  [
    /\bdropdb\b|\bdrop\s+(database|schema)\b/i,
    "Dropping a database or schema is irreversible."
  ],
  [
    /git\s+clean\b[^\n]*-[a-z]*x/i,
    "`git clean -x` deletes ignored files such as .env, local-docs/, local-data/ and .brag/."
  ]
];

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let command = "";
  try {
    command = String(JSON.parse(input)?.tool_input?.command ?? "");
  } catch {
    process.exit(0); // Unparseable payload: do not block unrelated work.
  }
  for (const [pattern, reason] of rules) {
    if (pattern.test(command)) {
      process.stderr.write(
        `Blocked by .claude/hooks/guard-destructive.mjs: ${reason} ` +
          "Ask the user to run it manually if it is truly intended."
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
