// Workspace index: every .asl file under the workspace roots, with open
// documents taking precedence over their contents on disk.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Location } from 'vscode-languageserver';
import type { Tree } from 'web-tree-sitter';
import { analyze, type FileIndex, type Occurrence, type PlanInfo } from './analysis.js';
import { parse } from './parser.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'bin', '.gradle', 'out', 'target']);

export function uriToPath(uri: string): string {
  return fileURLToPath(uri);
}

export function pathToUri(path: string): string {
  return pathToFileURL(path).href;
}

function walk(dir: string, pick: (name: string) => boolean, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
        walk(join(dir, e.name), pick, out);
      }
    } else if (pick(e.name)) {
      out.push(join(dir, e.name));
    }
  }
}

export interface Definition {
  location: Location;
  plan?: PlanInfo;
  role?: Occurrence['role'];
}

export class Workspace {
  readonly roots = new Set<string>();
  readonly files = new Map<string, FileIndex>();
  /** Trees of open documents, kept for position-based requests. */
  private readonly trees = new Map<string, Tree>();

  /** Index every .asl under a root directory (open documents win). */
  addRoot(root: string): void {
    root = resolve(root);
    if (this.roots.has(root)) {
      return;
    }
    this.roots.add(root);
    const paths: string[] = [];
    walk(root, n => n.endsWith('.asl'), paths);
    for (const path of paths) {
      const uri = pathToUri(path);
      if (!this.trees.has(uri)) {
        this.indexText(uri, readFileSync(path, 'utf8'));
      }
    }
  }

  /** Root for a file outside the known roots: nearest dir with a .mas2j. */
  projectRootOf(path: string): string {
    let dir = dirname(path);
    for (;;) {
      try {
        if (readdirSync(dir).some(n => n.endsWith('.mas2j'))) {
          return dir;
        }
      } catch {
        // unreadable: keep going up
      }
      const parent = dirname(dir);
      if (parent === dir) {
        return dirname(path);
      }
      dir = parent;
    }
  }

  private indexText(uri: string, text: string): FileIndex {
    const tree = parse(text);
    const index = analyze(uri, tree);
    tree.delete();
    this.files.set(uri, index);
    return index;
  }

  /** Update an open document; keeps its tree. */
  open(uri: string, text: string): FileIndex {
    const tree = parse(text);
    this.trees.get(uri)?.delete();
    this.trees.set(uri, tree);
    const index = analyze(uri, tree);
    this.files.set(uri, index);
    return index;
  }

  /** A document was closed: fall back to its contents on disk. */
  close(uri: string): void {
    this.trees.get(uri)?.delete();
    this.trees.delete(uri);
    const path = uriToPath(uri);
    if (existsSync(path)) {
      this.indexText(uri, readFileSync(path, 'utf8'));
    } else {
      this.files.delete(uri);
    }
  }

  /** A file changed on disk (not open in the editor). */
  refresh(uri: string): void {
    if (this.trees.has(uri)) {
      return;
    }
    const path = uriToPath(uri);
    if (existsSync(path)) {
      this.indexText(uri, readFileSync(path, 'utf8'));
    } else {
      this.files.delete(uri);
    }
  }

  tree(uri: string): Tree | undefined {
    return this.trees.get(uri);
  }

  // ── Includes ──────────────────────────────────────────────────────────

  /** aslSourcePath entries of the .mas2j files in a project root. */
  private sourcePaths(root: string): string[] {
    const out: string[] = [];
    let names: string[] = [];
    try {
      names = readdirSync(root).filter(n => n.endsWith('.mas2j'));
    } catch {
      return out;
    }
    for (const name of names) {
      const text = readFileSync(join(root, name), 'utf8');
      const m = /aslSourcePath\s*:\s*([^;]*);/.exec(text);
      if (m) {
        for (const p of m[1].matchAll(/"([^"]*)"/g)) {
          out.push(resolve(root, p[1]));
        }
      }
    }
    return out;
  }

  /** Resolve an include path like Jason: next to the file, then the source paths. */
  resolveInclude(fromUri: string, path: string): string | undefined {
    const from = uriToPath(fromUri);
    const root = this.projectRootOf(from);
    const candidates = [resolve(dirname(from), path), resolve(root, path), ...this.sourcePaths(root).map(d => resolve(d, path))];
    const hit = candidates.find(c => existsSync(c) && statSync(c).isFile());
    return hit ? pathToUri(hit) : undefined;
  }

  /** The file plus everything it includes, transitively. */
  scope(uri: string): Set<string> {
    const out = new Set<string>();
    const visit = (u: string): void => {
      if (out.has(u)) {
        return;
      }
      out.add(u);
      for (const inc of this.files.get(u)?.includes ?? []) {
        const target = this.resolveInclude(u, inc.path);
        if (target) {
          if (!this.files.has(target)) {
            this.indexText(target, readFileSync(uriToPath(target), 'utf8'));
          }
          visit(target);
        }
      }
    };
    visit(uri);
    return out;
  }

  // ── Lookups ───────────────────────────────────────────────────────────

  plansFor(key: string, match: (event: string) => boolean): Definition[] {
    const out: Definition[] = [];
    for (const [uri, index] of this.files) {
      for (const plan of index.plans) {
        if (plan.key === key && match(plan.event)) {
          out.push({ location: { uri, range: plan.selectionRange }, plan });
        }
      }
    }
    return out;
  }

  beliefsFor(key: string): Definition[] {
    const out: Definition[] = [];
    for (const [uri, index] of this.files) {
      for (const occ of index.occurrences) {
        if (occ.key === key && (occ.role === 'fact' || occ.role === 'rule-head')) {
          out.push({ location: { uri, range: occ.range }, role: occ.role });
        }
      }
    }
    return out;
  }

  /** Definitions for a literal used with a given role, nearest scope first. */
  definitions(fromUri: string, occ: Pick<Occurrence, 'key' | 'role' | 'event'>): Definition[] {
    const isGoal = (e: string): boolean => e.endsWith('!');
    const isTest = (e: string): boolean => e.endsWith('?');
    const isBelief = (e: string): boolean => !isGoal(e) && !isTest(e);
    let found: Definition[];
    switch (occ.role) {
      case 'goal':
        found = this.plansFor(occ.key, isGoal);
        break;
      case 'trigger':
        found = occ.event && isGoal(occ.event)
          ? this.plansFor(occ.key, isGoal)
          : this.beliefsFor(occ.key);
        break;
      case 'test':
        found = [...this.beliefsFor(occ.key), ...this.plansFor(occ.key, isTest)];
        break;
      default:
        found = this.beliefsFor(occ.key);
        if (found.length === 0) {
          found = this.plansFor(occ.key, isBelief);
        }
        if (found.length === 0) {
          found = this.plansFor(occ.key, isGoal);
        }
    }
    // Prefer the agent's own file and its includes when they have matches.
    const scope = this.scope(fromUri);
    const local = found.filter(d => scope.has(d.location.uri));
    return local.length > 0 ? local : found;
  }

  references(key: string): Location[] {
    const out: Location[] = [];
    for (const [uri, index] of this.files) {
      for (const occ of index.occurrences) {
        if (occ.key === key) {
          out.push({ uri, range: occ.range });
        }
      }
    }
    return out;
  }

  /** Java source of a user internal action (lib.action -> .../lib/action.java). */
  internalActionSource(name: string): string | undefined {
    if (name.startsWith('.')) {
      return undefined;
    }
    const suffix = join(...name.split('.')) + '.java';
    for (const root of this.roots) {
      const hits: string[] = [];
      walk(root, n => n.endsWith('.java'), hits);
      const hit = hits.find(h => h.endsWith('/' + suffix) || h.endsWith('\\' + suffix));
      if (hit) {
        return pathToUri(hit);
      }
    }
    return undefined;
  }
}
