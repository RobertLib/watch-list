/* eslint-disable @typescript-eslint/no-require-imports -- Next loads this adapter from its CommonJS ESLint plugin. */
const path = require("node:path");
const fs = require("node:fs");
const { globSync: tinyGlobSync, isDynamicPattern } = require("tinyglobby");

// Next 16.3's ESLint plugin only uses fast-glob's globSync to find root
// directories. Keep that API without its unpatched braces dependency.
// tinyglobby expands directory inputs recursively by default and returns
// relative paths even for absolute patterns, so adapt both differences.

// Its crawler does not emit directory symlinks. Present those as directories
// so globbed workspace roots retain their link paths, as fast-glob does. Skip
// links back to an ancestor to keep recursive patterns bounded.
function readDirectory(directory, options) {
  return fs.readdirSync(directory, options).flatMap((entry) => {
    if (!entry.isSymbolicLink()) return [entry];

    try {
      const filename = path.join(directory, entry.name);
      if (!fs.statSync(filename).isDirectory()) return [entry];

      const target = fs.realpathSync(filename);
      for (let parent = path.resolve(directory); ; parent = path.dirname(parent)) {
        if (fs.realpathSync(parent) === target) return [];
        if (path.dirname(parent) === parent) break;
      }

      return [{
        name: entry.name,
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => false,
      }];
    } catch {
      // Broken links and files are left to the crawler's ordinary handling.
      return [entry];
    }
  });
}

function globSync(pattern, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  // A literal directory must name itself, never its descendants. This also
  // covers "." and the absolute cwd, which glob engines handle differently.
  if (!isDynamicPattern(pattern)) {
    try {
      const filename = path.resolve(cwd, pattern);
      const stat = fs.statSync(filename);
      if (options.onlyDirectories && !stat.isDirectory()) return [];
      return [pattern];
    } catch {
      return [];
    }
  }
  const absolute = options.absolute ?? path.isAbsolute(pattern);
  let patterns = pattern;
  if (/(^|\/)\*\*\/?$/.test(pattern)) {
    // fast-glob skips literal traversal bases, including brace-expanded ones,
    // but includes roots selected by a wildcard before the trailing globstar.
    // Query descendants explicitly so tinyglobby's zero-length globstar match
    // cannot add or remove those roots.
    const prefix = pattern.replace(/\*\*\/?$/, "") || ".";
    const descendants = `${prefix.replace(/\/?$/, "/")}**/*`;
    patterns = isDynamicPattern(prefix.replace(/[{},]/g, ""))
      ? [prefix, descendants]
      : descendants;
  }
  return tinyGlobSync(patterns, {
    ...options,
    expandDirectories: false,
    absolute: true,
    fs: { readdirSync: readDirectory },
  }).map((entry) => {
    const normalized = path.normalize(entry);
    const resolved = normalized.replace(/[\\/]+$/, "") || path.parse(normalized).root;
    return absolute ? resolved : path.relative(cwd, resolved).replace(/\\/g, "/") || ".";
  });
}

module.exports = { globSync };
