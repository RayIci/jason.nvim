// Request handlers. Each takes the workspace, the document and a position.

import { basename } from 'node:path';
import {
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  SymbolKind,
  type CompletionItem,
  type DocumentSymbol,
  type Hover,
  type Location,
  type Position,
  type SymbolInformation,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Node } from 'web-tree-sitter';
import { children, keyOf, rangeOf, roleOf, type Occurrence, type Role } from './analysis.js';
import { documentation, internalAction, stdlib } from './stdlib.js';
import { uriToPath, type Definition, type Workspace } from './workspace.js';

const PERFORMATIVES = ['tell', 'untell', 'achieve', 'unachieve', 'askOne', 'askAll', 'askHow', 'tellHow', 'untellHow', 'signal'];
const KEYWORDS = ['if', 'elif', 'else', 'for', 'while', 'not', 'true', 'false', 'div', 'mod'];

// ── Position helpers ────────────────────────────────────────────────────

function nodeAt(ws: Workspace, uri: string, pos: Position): Node | null {
  const tree = ws.tree(uri);
  return tree ? tree.rootNode.descendantForPosition({ row: pos.line, column: pos.character }) : null;
}

/** The literal whose functor is at the position. */
function literalAt(ws: Workspace, uri: string, pos: Position): Node | null {
  let node = nodeAt(ws, uri, pos);
  // descendantForPosition returns the node starting at the cursor; when the
  // cursor sits right after a word, look one character back.
  if (node && !['identifier', 'atom', 'internal_action', 'quoted_atom'].includes(node.type) && pos.character > 0) {
    node = nodeAt(ws, uri, { line: pos.line, character: pos.character - 1 });
  }
  for (let i = 0; node && i < 3; i++) {
    if (node.type === 'literal') {
      return node.childForFieldName('functor') ? node : null;
    }
    node = node.parent;
  }
  return null;
}

function occurrenceOf(literal: Node): (Pick<Occurrence, 'key' | 'name' | 'arity' | 'role' | 'event'>) | null {
  const k = keyOf(literal);
  if (!k) {
    return null;
  }
  const role: Role = roleOf(literal);
  let event: string | undefined;
  if (role === 'trigger' && literal.parent) {
    event = (literal.parent.childForFieldName('operator')?.text ?? '') + (literal.parent.childForFieldName('type')?.text ?? '');
  }
  return { ...k, role, event };
}

function includeAt(ws: Workspace, uri: string, pos: Position): string | undefined {
  const index = ws.files.get(uri);
  const inc = index?.includes.find(i => {
    const r = i.range;
    return pos.line === r.start.line && pos.character >= r.start.character && pos.character <= r.end.character;
  });
  return inc ? ws.resolveInclude(uri, inc.path) : undefined;
}

function where(loc: Location): string {
  return `${basename(uriToPath(loc.uri))}:${loc.range.start.line + 1}`;
}

// ── Definition / references ─────────────────────────────────────────────

export function definition(ws: Workspace, uri: string, pos: Position): Location[] {
  const included = includeAt(ws, uri, pos);
  if (included) {
    return [{ uri: included, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }];
  }
  const literal = literalAt(ws, uri, pos);
  const occ = literal && occurrenceOf(literal);
  if (!occ) {
    return [];
  }
  if (occ.role === 'internal-action') {
    const source = ws.internalActionSource(occ.name);
    return source ? [{ uri: source, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }] : [];
  }
  return ws.definitions(uri, occ).map(d => d.location);
}

export function references(ws: Workspace, uri: string, pos: Position, includeDeclaration: boolean): Location[] {
  const literal = literalAt(ws, uri, pos);
  const occ = literal && occurrenceOf(literal);
  if (!occ) {
    return [];
  }
  const all = ws.references(occ.key);
  if (includeDeclaration) {
    return all;
  }
  const decls = new Set(ws.definitions(uri, occ).map(d => `${d.location.uri}:${d.location.range.start.line}:${d.location.range.start.character}`));
  return all.filter(l => !decls.has(`${l.uri}:${l.range.start.line}:${l.range.start.character}`));
}

// ── Hover ───────────────────────────────────────────────────────────────

function describePlans(defs: Definition[]): string {
  return defs
    .slice(0, 8)
    .map(d => {
      const p = d.plan!;
      const ctx = p.context ? ` : ${p.context}` : '';
      return `- \`${p.label ? p.label + ' ' : ''}${p.trigger}${ctx}\` — ${where(d.location)}`;
    })
    .join('\n') + (defs.length > 8 ? `\n- … ${defs.length - 8} more` : '');
}

export function hover(ws: Workspace, uri: string, pos: Position): Hover | null {
  const included = includeAt(ws, uri, pos);
  if (included) {
    return { contents: { kind: MarkupKind.Markdown, value: `Includes \`${uriToPath(included)}\`` } };
  }
  const literal = literalAt(ws, uri, pos);
  const occ = literal && occurrenceOf(literal);
  if (!literal || !occ) {
    return null;
  }
  const range = rangeOf(literal.childForFieldName('functor')!);
  if (occ.role === 'internal-action') {
    const ia = internalAction(occ.name);
    if (ia) {
      return { range, contents: { kind: MarkupKind.Markdown, value: documentation(ia) } };
    }
    const source = ws.internalActionSource(occ.name);
    const value = `Internal action \`${occ.name}\`` + (source ? `\n\nDefined in \`${uriToPath(source)}\`` : '');
    return { range, contents: { kind: MarkupKind.Markdown, value } };
  }
  const defs = ws.definitions(uri, occ);
  const plans = defs.filter(d => d.plan);
  const beliefs = defs.filter(d => !d.plan);
  const parts: string[] = [];
  if (occ.role === 'goal' || (occ.role === 'trigger' && occ.event?.endsWith('!'))) {
    parts.push(`**Goal** \`${occ.key}\``);
    parts.push(plans.length ? `Plans:\n${describePlans(plans)}` : '_No plan handles this goal._');
  } else {
    parts.push(`**${occ.role === 'action' ? 'Action' : 'Belief'}** \`${occ.key}\``);
    if (beliefs.length) {
      parts.push('Defined at: ' + beliefs.slice(0, 8).map(d => `${where(d.location)}${d.role === 'rule-head' ? ' (rule)' : ''}`).join(', '));
    }
    if (plans.length) {
      parts.push(`Plans:\n${describePlans(plans)}`);
    }
  }
  return { range, contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') } };
}

// ── Completion ──────────────────────────────────────────────────────────

function snippetCall(name: string, params: string[]): string {
  if (params.length === 0) {
    return name;
  }
  return `${name}(${params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`;
}

interface Known {
  name: string;
  arity: number;
  params: string[];
  detail: string;
}

function knownGoals(ws: Workspace): Map<string, Known> {
  const out = new Map<string, Known>();
  for (const index of ws.files.values()) {
    for (const p of index.plans) {
      if (p.event.endsWith('!') && !out.has(p.key)) {
        const [name, arity] = [p.key.slice(0, p.key.lastIndexOf('/')), Number(p.key.slice(p.key.lastIndexOf('/') + 1))];
        out.set(p.key, { name, arity, params: p.params, detail: `goal, plan ${p.trigger}` });
      }
    }
  }
  return out;
}

function knownBeliefs(ws: Workspace): Map<string, Known> {
  const out = new Map<string, Known>();
  const add = (o: Occurrence, detail: string): void => {
    if (!out.has(o.key)) {
      out.set(o.key, { name: o.name, arity: o.arity, params: Array.from({ length: o.arity }, (_, i) => `Arg${i + 1}`), detail });
    }
  };
  for (const index of ws.files.values()) {
    for (const o of index.occurrences) {
      if (o.role === 'fact') add(o, 'belief');
      else if (o.role === 'rule-head') add(o, 'rule');
    }
    for (const o of index.occurrences) {
      if ((o.role === 'trigger' && o.event && !o.event.endsWith('!') && !o.event.endsWith('?')) || o.role === 'update') {
        add(o, 'belief (perceived or added at run time)');
      }
    }
  }
  return out;
}

function literalItems(known: Map<string, Known>, kind: CompletionItemKind): CompletionItem[] {
  return [...known.values()].map(k => ({
    label: k.arity ? `${k.name}/${k.arity}` : k.name,
    kind,
    detail: k.detail,
    filterText: k.name,
    insertText: snippetCall(k.name, k.params),
    insertTextFormat: InsertTextFormat.Snippet,
  }));
}

function variablesInClause(ws: Workspace, uri: string, pos: Position): string[] {
  // The character before the cursor: at the end of a line the cursor
  // itself is past every node.
  let node = nodeAt(ws, uri, { line: pos.line, character: Math.max(0, pos.character - 1) });
  // The enclosing clause; while it's being typed it may not parse, so fall
  // back to the top-level node around the cursor (often an ERROR node).
  let topLevel: Node | null = null;
  while (node && !['plan', 'rule', 'belief', 'initial_goal'].includes(node.type)) {
    if (node.parent?.type === 'source_file') {
      topLevel = node;
    }
    node = node.parent;
  }
  node = node ?? topLevel;
  if (!node) {
    return [];
  }
  const names = new Set<string>();
  const visit = (n: Node): void => {
    if (n.type === 'variable') names.add(n.text);
    for (const c of children(n)) visit(c);
  };
  visit(node);
  return [...names];
}

export function completion(ws: Workspace, doc: TextDocument, pos: Position): CompletionItem[] {
  const line = doc.getText({ start: { line: pos.line, character: 0 }, end: pos });

  // Internal actions: `.pri|`
  const ia = /(^|[^\w.)\]'"])(\.[\w.]*)$/.exec(line);
  if (ia) {
    const start = pos.character - ia[2].length;
    const range = { start: { line: pos.line, character: start }, end: pos };
    return stdlib.map(e => ({
      label: e.name,
      kind: CompletionItemKind.Function,
      detail: e.literal || e.name,
      documentation: { kind: MarkupKind.Markdown, value: documentation(e) },
      filterText: e.name,
      textEdit: { range, newText: e.name },
    }));
  }

  // Performatives: .send(Ag, |  and  .broadcast(|
  if (/\.send\(\s*[^,()]+,\s*\w*$/.test(line) || /\.broadcast\(\s*\w*$/.test(line)) {
    return PERFORMATIVES.map(p => ({ label: p, kind: CompletionItemKind.EnumMember, detail: 'performative' }));
  }

  // Variables of the current clause: `Fo|`
  if (/(^|[^\w.])[A-Z]\w*$/.test(line)) {
    return variablesInClause(ws, doc.uri, pos).map(v => ({ label: v, kind: CompletionItemKind.Variable }));
  }

  // Goals: `!go|`, `!!go|`, `+!go|`, `-!go|`
  if (/!!?\s*[a-z]?\w*$/.test(line)) {
    const items = literalItems(knownGoals(ws), CompletionItemKind.Event);
    // goals posted somewhere but without a plan yet, for writing the plan
    if (/^\s*(@\S+\s+)?[+\-^]!\s*\w*$/.test(line)) {
      const known = knownGoals(ws);
      for (const index of ws.files.values()) {
        for (const o of index.occurrences) {
          if (o.role === 'goal' && !known.has(o.key)) {
            known.set(o.key, { name: o.name, arity: o.arity, params: Array.from({ length: o.arity }, (_, i) => `Arg${i + 1}`), detail: 'goal without a plan' });
            items.push(...literalItems(new Map([[o.key, known.get(o.key)!]]), CompletionItemKind.Event));
          }
        }
      }
    }
    return items;
  }

  // Beliefs and rules: tests `?b|`, updates `+b|`, contexts, conditions
  const beliefs = literalItems(knownBeliefs(ws), CompletionItemKind.Constant);
  if (/[?+\-]\s*[a-z]?\w*$/.test(line)) {
    return beliefs;
  }
  return [
    ...beliefs,
    ...KEYWORDS.map(k => ({ label: k, kind: CompletionItemKind.Keyword })),
  ];
}

// ── Symbols ─────────────────────────────────────────────────────────────

export function documentSymbols(ws: Workspace, uri: string): DocumentSymbol[] {
  return ws.files.get(uri)?.symbols ?? [];
}

export function workspaceSymbols(ws: Workspace, query: string): SymbolInformation[] {
  const q = query.toLowerCase();
  const out: SymbolInformation[] = [];
  const visit = (uri: string, symbols: DocumentSymbol[], container?: string): void => {
    for (const s of symbols) {
      if (!q || s.name.toLowerCase().includes(q)) {
        out.push({ name: s.name, kind: s.kind, location: { uri, range: s.selectionRange }, containerName: container ?? basename(uriToPath(uri)) });
      }
      if (s.children?.length) {
        visit(uri, s.children, s.kind === SymbolKind.Namespace ? s.name : container);
      }
    }
  };
  for (const [uri, index] of ws.files) {
    visit(uri, index.symbols);
  }
  return out.slice(0, 500);
}
