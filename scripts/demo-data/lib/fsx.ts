/**
 * 파일 시스템 안전장치 — NFC 경로 맵, 루트 가드, 원자적 쓰기, tar 백업. 삭제 기능 없음.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, join, basename as pathBasename } from "node:path";
import { execFileSync } from "node:child_process";
import { nfc } from "../../../src/utils";

export interface VaultFolder {
  /** realpath */
  root: string;
  /** NFC 상대경로 → 실제 상대경로 */
  files: Map<string, string>;
}

/** 폴더를 재귀로 읽어 NFC 키 맵을 만든다 (.md만, 숨김 제외) */
export function scanFolder(root: string): VaultFolder {
  const real = realpathSync(root);
  const files = new Map<string, string>();
  const walk = (rel: string) => {
    for (const ent of readdirSync(join(real, rel), { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(relPath);
      else if (ent.name.endsWith(".md")) files.set(nfc(relPath), relPath);
    }
  };
  walk("");
  return { root: real, files };
}

/** 성도 폴더인지 확인: 이름이 `460. 성도`로 끝나고 상위 어딘가에 .obsidian 이 있어야 한다 */
export function assertMemberRoot(root: string, expectedBasename: string): string {
  const real = realpathSync(root);
  if (nfc(pathBasename(real)) !== nfc(expectedBasename)) {
    throw new Error(`대상 폴더 이름이 "${expectedBasename}"가 아닙니다: ${real}`);
  }
  let dir = dirname(real);
  let found = false;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, ".obsidian"))) {
      found = true;
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!found) throw new Error(`상위에 .obsidian 폴더가 없습니다 (볼트가 아님): ${real}`);
  return real;
}

export function assertInside(root: string, target: string): void {
  const r = realpathSync(root);
  const t = join(r, target);
  if (!t.startsWith(r + "/")) throw new Error(`루트 밖 쓰기 차단: ${target}`);
}

/** 같은 폴더의 점 접두 임시파일 → rename (원자적) */
export function atomicWrite(root: string, rel: string, content: string): void {
  assertInside(root, rel);
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  const tmp = join(dirname(full), `.${pathBasename(full)}.tmp`);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, full);
}

export function backupTar(root: string, outDir: string, label: string): string {
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const out = join(outDir, `${nfc(pathBasename(root))}_${label}_${stamp}.tar.gz`);
  execFileSync("tar", ["-czf", out, "-C", dirname(root), pathBasename(root)]);
  const listed = execFileSync("tar", ["-tzf", out], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  const expected = countEntries(root);
  if (listed < expected) throw new Error(`백업 항목 수 불일치: tar ${listed} < 실제 ${expected}`);
  return out;
}

function countEntries(root: string): number {
  let n = 0;
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      n++;
      if (ent.isDirectory()) walk(join(dir, ent.name));
    }
  };
  walk(root);
  return n;
}

export function isObsidianRunning(): boolean {
  try {
    execFileSync("pgrep", ["-x", "Obsidian"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function mtimeOf(path: string): number {
  return statSync(path).mtimeMs;
}
