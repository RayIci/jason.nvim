// Per-file analysis: everything the server needs from one parsed .asl file.

import type { Node, Tree } from 'web-tree-sitter';
import {
  DiagnosticSeverity,
  SymbolKind,
  type Diagnostic,
  type DocumentSymbol,
  type Range,
} from 'vscode-languageserver';

/** How a literal is used where it appears. */
export type Role =
  | 'trigger' // +!g, +b: the event a plan handles
  | 'goal' // !g, !!g, initial goal
  | 'test' // ?q
  | 'fact' // b(1).
  | 'rule-head' // h :- ...
  | 'update' // +b, -b, -+b in a body
  | 'query' // in a context, rule body, condition or test
  | 'action' // environment action in a body
  | 'internal-action' // .print, lib.action
  | 'term'; // nested inside arguments or lists

export interface Occurrence {
  /** functor/arity, e.g. move/2 */
  key: string;
  name: string;
  arity: number;
  role: Role;
  /** Range of the functor. */
  range: Range;
  /** For triggers: the event operator and type, e.g. "+!" or "-". */
  event?: string;
}

export interface PlanInfo {
  key: string;
  /** "+!", "-!", "+?", "+", "-", "^!"... */
  event: string;
  /** Trigger text, whitespace collapsed: +!move(From, To) */
  trigger: string;
  label?: string;
  context?: string;
  /** Names of the trigger's arguments, for completion placeholders. */
  params: string[];
  range: Range;
  selectionRange: Range;
}

export interface Include {
  path: string;
  range: Range;
}

export interface FileIndex {
  uri: string;
  symbols: DocumentSymbol[];
  occurrences: Occurrence[];
  plans: PlanInfo[];
  includes: Include[];
  diagnostics: Diagnostic[];
}

export function rangeOf(node: Node): Range {
  return {
    start: { line: node.startPosition.row, character: node.startPosition.column },
    end: { line: node.endPosition.row, character: node.endPosition.column },
  };
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Named children without comments (comments are extras and appear anywhere). */
export function children(node: Node): Node[] {
  return node.namedChildren.filter((c): c is Node => c !== null && c.type !== 'comment');
}

export function functorOf(literal: Node): Node | null {
  return literal.childForFieldName('functor');
}

export function arityOf(literal: Node): number {
  const args = literal.childForFieldName('arguments');
  return args ? children(args).length : 0;
}

/** functor/arity of a literal, or null for variables, true and false. */
export function keyOf(literal: Node): { key: string; name: string; arity: number } | null {
  const functor = functorOf(literal);
  if (!functor) {
    return null;
  }
  const name = functor.text;
  const arity = arityOf(literal);
  return { key: `${name}/${arity}`, name, arity };
}

const EXPRESSION_TYPES = new Set(['binary_expression', 'not_expression', 'parenthesized_expression', 'unary_expression']);

/** Classify how a literal is used, from its position in the tree. */
export function roleOf(literal: Node): Role {
  const functor = functorOf(literal);
  if (functor?.type === 'internal_action') {
    return 'internal-action';
  }
  let parent = literal.parent;
  let viaExpression = false;
  while (parent && EXPRESSION_TYPES.has(parent.type)) {
    viaExpression = true;
    parent = parent.parent;
  }
  if (!parent) {
    return 'query';
  }
  switch (parent.type) {
    case 'trigger':
      return 'trigger';
    case 'achieve':
    case 'initial_goal':
      return 'goal';
    case 'test_goal':
      return 'test';
    case 'belief':
      return 'fact';
    case 'rule':
      return parent.childForFieldName('head')?.id === literal.id ? 'rule-head' : 'query';
    case 'belief_update':
      return 'update';
    case 'arguments':
    case 'list':
      return 'term';
    case 'plan_body':
    case 'parallel_and':
    case 'parallel_or':
      return viaExpression ? 'query' : 'action';
    default:
      return 'query';
  }
}

function eventOf(trigger: Node): string {
  const op = trigger.childForFieldName('operator')?.text ?? '';
  const type = trigger.childForFieldName('type')?.text ?? '';
  return op + type;
}

/** Variable names of a trigger's arguments: +!move(From, To) -> [From, To]. */
function paramsOf(literal: Node): string[] {
  const args = literal.childForFieldName('arguments');
  if (!args) {
    return [];
  }
  return children(args).map((arg, i) => {
    const v = arg.type === 'literal' ? children(arg)[0] : arg;
    return v && (v.type === 'variable' || v.type === 'anonymous_variable') && v.text !== '_' ? v.text : `Arg${i + 1}`;
  });
}

function planInfo(plan: Node): PlanInfo | null {
  const trigger = plan.childForFieldName('trigger');
  const literal = trigger?.childForFieldName('literal');
  const k = literal ? keyOf(literal) : null;
  if (!trigger || !literal || !k) {
    return null;
  }
  const label = plan.childForFieldName('label');
  const context = plan.childForFieldName('context');
  return {
    key: k.key,
    event: eventOf(trigger),
    trigger: oneLine(trigger.text),
    label: label ? oneLine(label.text) : undefined,
    context: context ? oneLine(context.text) : undefined,
    params: paramsOf(literal),
    range: rangeOf(plan),
    selectionRange: rangeOf(trigger),
  };
}

// ── Document symbols ────────────────────────────────────────────────────

function symbolsOf(nodes: Node[]): DocumentSymbol[] {
  const out: DocumentSymbol[] = [];
  for (const node of nodes) {
    const s = symbolOf(node);
    if (s) {
      out.push(s);
    }
  }
  return out;
}

function symbolOf(node: Node): DocumentSymbol | null {
  switch (node.type) {
    case 'plan': {
      const info = planInfo(node);
      if (!info) {
        return null;
      }
      const subPlans = node.childForFieldName('sub_plans');
      return {
        name: info.trigger,
        detail: [info.label, info.context && `: ${info.context}`].filter(Boolean).join(' '),
        kind: SymbolKind.Event,
        range: info.range,
        selectionRange: info.selectionRange,
        children: subPlans ? symbolsOf(children(subPlans)) : [],
      };
    }
    case 'rule': {
      const head = node.childForFieldName('head');
      return head
        ? { name: oneLine(head.text), detail: 'rule', kind: SymbolKind.Function, range: rangeOf(node), selectionRange: rangeOf(head) }
        : null;
    }
    case 'belief': {
      const literal = node.childForFieldName('literal');
      return literal
        ? { name: oneLine(literal.text), detail: 'belief', kind: SymbolKind.Constant, range: rangeOf(node), selectionRange: rangeOf(literal) }
        : null;
    }
    case 'initial_goal': {
      const literal = node.childForFieldName('literal');
      return literal
        ? { name: '!' + oneLine(literal.text), detail: 'initial goal', kind: SymbolKind.Key, range: rangeOf(node), selectionRange: rangeOf(literal) }
        : null;
    }
    case 'directive': {
      const parts = children(node);
      const name = parts.filter(p => ['atom', 'internal_action', 'arguments', 'list'].includes(p.type)).map(p => p.text).join('');
      const nested = parts.filter(p => ['belief', 'rule', 'initial_goal', 'plan', 'directive'].includes(p.type));
      const isBlock = node.children.some(c => c?.type === 'begin');
      return {
        name: oneLine(name),
        detail: isBlock ? 'directive block' : 'directive',
        kind: name.startsWith('include') ? SymbolKind.File : SymbolKind.Namespace,
        range: rangeOf(node),
        selectionRange: rangeOf(parts[0] ?? node),
        children: symbolsOf(nested),
      };
    }
    default:
      return null;
  }
}

// ── Diagnostics ─────────────────────────────────────────────────────────

function syntaxDiagnostics(root: Node, out: Diagnostic[]): void {
  const visit = (node: Node): void => {
    if (node.isMissing) {
      out.push({
        range: rangeOf(node),
        severity: DiagnosticSeverity.Error,
        source: 'jason',
        message: `missing '${node.type}'`,
      });
      return;
    }
    if (node.isError) {
      const text = oneLine(node.text);
      out.push({
        range: rangeOf(node),
        severity: DiagnosticSeverity.Error,
        source: 'jason',
        message: text && text.length <= 30 ? `syntax error: unexpected '${text}'` : 'syntax error',
      });
      return;
    }
    if (node.hasError) {
      for (const c of node.children) {
        if (c) {
          visit(c);
        }
      }
    }
  };
  visit(root);
}

/** Occurrences of each variable in a clause, not counting its sub-plans. */
function ownVariables(clause: Node): Map<string, Node[]> {
  const seen = new Map<string, Node[]>();
  const visit = (node: Node): void => {
    if (node.type === 'sub_plans') {
      return;
    }
    if (node.type === 'variable') {
      const list = seen.get(node.text) ?? [];
      list.push(node);
      seen.set(node.text, list);
    }
    for (const c of node.namedChildren) {
      if (c) {
        visit(c);
      }
    }
  };
  visit(clause);
  return seen;
}

function allVariables(node: Node, out: Set<string>): Set<string> {
  if (node.type === 'variable') {
    out.add(node.text);
  }
  for (const c of node.namedChildren) {
    if (c) {
      allVariables(c, out);
    }
  }
  return out;
}

/**
 * Variables used only once in a clause, as Jason warns about. Sub-plans
 * share variables with the plans around them, so a variable is not a
 * singleton when an enclosing plan or one of its sub-plans uses it too.
 */
function singletonDiagnostics(clause: Node, out: Diagnostic[], enclosing: Set<string> = new Set()): void {
  const own = ownVariables(clause);
  const subPlans = clause.childForFieldName('sub_plans');
  const inSubPlans = subPlans ? allVariables(subPlans, new Set()) : new Set<string>();
  for (const [name, nodes] of own) {
    if (nodes.length === 1 && !enclosing.has(name) && !inSubPlans.has(name)) {
      out.push({
        range: rangeOf(nodes[0]),
        severity: DiagnosticSeverity.Warning,
        source: 'jason',
        message: `singleton variable ${name} (use _${name} or _ if it is intentionally unused)`,
      });
    }
  }
  if (subPlans) {
    const scope = new Set([...enclosing, ...own.keys()]);
    for (const sub of children(subPlans)) {
      if (sub.type === 'plan') {
        singletonDiagnostics(sub, out, scope);
      }
    }
  }
}

// ── Entry point ─────────────────────────────────────────────────────────

export function analyze(uri: string, tree: Tree): FileIndex {
  const root = tree.rootNode;
  const index: FileIndex = { uri, symbols: symbolsOf(children(root)), occurrences: [], plans: [], includes: [], diagnostics: [] };

  syntaxDiagnostics(root, index.diagnostics);

  const visit = (node: Node): void => {
    switch (node.type) {
      case 'plan': {
        const info = planInfo(node);
        if (info) {
          index.plans.push(info);
        }
        // sub-plans are checked together with the plan that contains them
        if (node.parent?.type !== 'sub_plans') {
          singletonDiagnostics(node, index.diagnostics);
        }
        break;
      }
      case 'rule':
        singletonDiagnostics(node, index.diagnostics);
        break;
      case 'directive': {
        const parts = children(node);
        if (parts[0]?.text === 'include') {
          const arg = parts.find(p => p.type === 'arguments');
          const str = arg ? children(arg)[0] : undefined;
          if (str?.type === 'string') {
            index.includes.push({ path: str.text.slice(1, -1), range: rangeOf(str) });
          }
        }
        break;
      }
      case 'literal': {
        const k = keyOf(node);
        const functor = functorOf(node);
        if (k && functor) {
          const role = roleOf(node);
          const occ: Occurrence = { ...k, role, range: rangeOf(functor) };
          if (role === 'trigger' && node.parent) {
            occ.event = eventOf(node.parent);
          }
          index.occurrences.push(occ);
        }
        break;
      }
    }
    for (const c of node.namedChildren) {
      if (c) {
        visit(c);
      }
    }
  };
  visit(root);
  return index;
}
