import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs") as {
  getRootDirs: (context: {
    cwd: string;
    settings: { next?: { rootDir?: string | string[] } };
  }) => string[];
};

let fixture: string;
beforeAll(() => {
  fixture = mkdtempSync(path.join(tmpdir(), "watch-list-eslint-"));
  mkdirSync(path.join(fixture, "apps", "one", "nested"), { recursive: true });
  mkdirSync(path.join(fixture, "apps", "two"), { recursive: true });
  writeFileSync(path.join(fixture, "apps", "file.txt"), "not a directory");
  mkdirSync(path.join(fixture, "linked-workspaces", "real", "child"), { recursive: true });
  mkdirSync(path.join(fixture, "linked-workspaces", "apps"));
  const linkType = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(
    path.join(fixture, "linked-workspaces", "real"),
    path.join(fixture, "linked-workspaces", "apps", "alias"),
    linkType,
  );
  symlinkSync(
    path.join(fixture, "linked-workspaces", "real"),
    path.join(fixture, "linked-workspaces", "real", "child", "cycle"),
    linkType,
  );
});
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function roots(rootDir?: string | string[]) {
  return getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir } } }).sort();
}

describe("Next ESLint project discovery with the safe glob adapter", () => {
  it("uses the working directory when no root setting is configured", () => {
    expect(roots()).toEqual([process.cwd()]);
  });

  it("keeps literal roots without recursively expanding their descendants", () => {
    expect(roots(fixture)).toEqual([fixture]);
    expect(roots(process.cwd())).toEqual([process.cwd()]);
    expect(roots(".")).toEqual(["."]);
  });

  it("discovers only matching directories from wildcard and brace patterns", () => {
    const expected = [path.join(fixture, "apps", "one"), path.join(fixture, "apps", "two")];
    expect(roots(`${fixture}/apps/*`)).toEqual(expected);
    expect(roots(`${fixture}/apps/{one,two}`)).toEqual(expected);
  });

  it("preserves relative paths and supports multiple configured roots", () => {
    const relative = path.relative(process.cwd(), fixture).replace(/\\/g, "/");
    expect(roots(`${relative}/apps/*`)).toEqual([
      `${relative}/apps/one`,
      `${relative}/apps/two`,
    ]);
    expect(roots([`${fixture}/apps/one`, `${fixture}/apps/two`])).toEqual([
      path.join(fixture, "apps", "one"),
      path.join(fixture, "apps", "two"),
    ]);
  });

  it("returns no roots for absent paths or literal files", () => {
    expect(roots(`${fixture}/missing`)).toEqual([]);
    expect(roots(`${fixture}/apps/file.txt`)).toEqual([]);
  });

  it("retains linked workspace paths for absolute and relative globs", () => {
    const linked = path.join(fixture, "linked-workspaces", "apps", "alias");
    expect(roots(`${fixture}/linked-workspaces/apps/*`)).toEqual([linked]);
    expect(roots(`${fixture}/linked-workspaces/apps/alias/*`)).toEqual([
      path.join(linked, "child"),
    ]);

    const relative = path.relative(process.cwd(), fixture).replace(/\\/g, "/");
    expect(roots(`${relative}/linked-workspaces/apps/*`)).toEqual([
      `${relative}/linked-workspaces/apps/alias`,
    ]);
  });

  it("excludes the traversal base from recursive directory globs", () => {
    const expected = [
      path.join(fixture, "apps", "one"),
      path.join(fixture, "apps", "one", "nested"),
      path.join(fixture, "apps", "two"),
    ];
    expect(roots(`${fixture}/apps/**/`)).toEqual(expected);
    expect(roots(`${fixture}/apps/**`)).toEqual(expected);
  });

  it("keeps wildcard roots but excludes brace-expanded literal bases before globstars", () => {
    expect(roots(`${fixture}/apps/*/**`)).toEqual([
      path.join(fixture, "apps", "one"),
      path.join(fixture, "apps", "one", "nested"),
      path.join(fixture, "apps", "two"),
    ]);
    expect(roots(`${fixture}/apps/{one,two}/**/`)).toEqual([
      path.join(fixture, "apps", "one", "nested"),
    ]);
  });

  it("follows linked roots without recursing through ancestor cycles", () => {
    const linked = path.join(fixture, "linked-workspaces", "apps", "alias");
    expect(roots(`${fixture}/linked-workspaces/apps/**/`)).toEqual([
      linked,
      path.join(linked, "child"),
    ]);
  });
});
