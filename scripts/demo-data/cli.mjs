// 부트스트랩: cli.ts 를 esbuild 로 단독 번들한 뒤 실행 (scripts/e2e-check.mjs 와 같은 방식)
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const out = join(here, ".cli.bundle.mjs");
execSync(
  `npx esbuild "${join(here, "cli.ts")}" --bundle --platform=node --format=esm --target=node18 --outfile="${out}" --log-level=warning`,
  { cwd: repo, stdio: "inherit" },
);
process.argv.splice(1, 1, out);
await import(out);
