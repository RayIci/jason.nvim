// Formatter: lays out plans, rules and bodies from the tree-sitter tree.
//
// - A plan or rule written on one line stays on one line when it fits;
//   otherwise the context goes under the trigger and each body formula on
//   its own line, aligned after `<-`. if/for/while blocks and sub-plans are
//   indented.
// - Spacing inside formulas is normalised token by token.
// - Comments and single blank lines are kept. A clause with a comment in a
//   place the layout cannot keep (inside a literal, say) is left verbatim.
// - Tokens are never added, removed or reordered.

import type { Node, Tree } from 'web-tree-sitter';
import { parse } from './parser.js';

export interface FormatOptions {
  /** One indentation level, e.g. four spaces or a tab. */
  indent: string;
  /** Lines longer than this are broken where the layout allows. */
  width: number;
}

const ATOMIC = new Set(['string', 'quoted_atom', 'comment', 'internal_action', 'number', 'identifier', 'variable', 'anonymous_variable', 'escape_sequence']);
const CLOSERS = new Set([')', ']', '}', ',', ';', '.']);
const STATEMENTS = new Set(['if_statement', 'for_statement', 'while_statement']);
/** Parents whose direct comment children the layout knows how to place. */
const COMMENT_PARENTS = new Set(['source_file', 'plan', 'plan_body', 'sub_plans', 'block', 'directive']);

// ── Token spacing ───────────────────────────────────────────────────────

function leaves(node: Node, out: Node[] = []): Node[] {
  if (ATOMIC.has(node.type) || node.childCount === 0) {
    out.push(node);
    return out;
  }
  for (const c of node.children) {
    if (c) {
      leaves(c, out);
    }
  }
  return out;
}

function isAnnotationList(node: Node | null): boolean {
  return node?.type === 'list' && ['literal', 'label', 'directive'].includes(node.parent?.type ?? '');
}

function prefixOperator(node: Node): boolean {
  const p = node.parent?.type;
  if (p === 'trigger' || p === 'achieve' || p === 'test_goal' || p === 'initial_goal' || p === 'belief_update' || p === 'unary_expression') {
    return node.parent?.firstChild?.id === node.id || (p === 'trigger' && (node.type === '!' || node.type === '?'));
  }
  return false;
}

/** Whether one space separates two adjacent tokens. */
function spaced(prev: Node, next: Node): boolean {
  const pt = prev.type;
  const nt = next.type;
  const pp = prev.parent?.type;
  const np = next.parent?.type;
  // `{` `}` of directives and one-line blocks are padded; plan terms are not.
  if (pt === '{') return pp === 'directive' || pp === 'block';
  if (nt === '}') return np === 'directive' || np === 'block';
  if (CLOSERS.has(nt)) return false;
  if (pt === '(' || pt === '[') return false;
  if (pt === '::' || nt === '::') return false;
  if (pt === '@') return false;
  if (pt === '~') return false;
  if (prefixOperator(prev)) return false;
  if (pt === '|' && pp === 'list') return false;
  if (nt === '|' && np === 'list') return false;
  if (nt === '(') {
    if (np === 'arguments') return false; // functor(args
    return true; // if (, not (, ... ( after an operator
  }
  if (nt === '[') {
    return !isAnnotationList(next.parent); // p[annots] but `, [1, 2]`
  }
  return true;
}

/** Nodes on one line with normalised spacing. */
function flat(...nodes: Node[]): string {
  const toks = nodes.flatMap(n => leaves(n));
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    if (i > 0 && spaced(toks[i - 1], toks[i])) {
      out += ' ';
    }
    out += toks[i].text;
  }
  return out;
}

// ── Lines ───────────────────────────────────────────────────────────────

interface Line {
  text: string;
  comment?: string;
  /** A line holding only a comment: code must not be appended to it. */
  commentOnly?: boolean;
}

class Out {
  readonly lines: Line[] = [];

  push(text: string): void {
    this.lines.push({ text });
  }

  /**
   * Append code to the last line. After a comment (trailing or on its own
   * line) the code starts a new line at `prefix`.
   */
  append(text: string, prefix: string): void {
    const last = this.lines[this.lines.length - 1];
    // never move code in front of a comment: start a new line instead
    if (!last || last.commentOnly || last.comment) {
      this.push(prefix + text.trimStart());
    } else {
      last.text += text;
    }
  }

  pushComment(ind: string, comment: string): void {
    const [first, ...rest] = comment.split('\n');
    this.lines.push({ text: ind + first, commentOnly: true });
    for (const line of rest) {
      this.lines.push({ text: line.replace(/\s+$/, ''), commentOnly: true });
    }
  }

  /** A comment on the same source line as the code before it. */
  trail(comment: string): void {
    const last = this.lines[this.lines.length - 1];
    if (!last || last.comment || last.commentOnly) {
      this.pushComment('', comment);
    } else {
      last.comment = comment;
    }
  }

  blank(): void {
    const last = this.lines[this.lines.length - 1];
    if (last && (last.text !== '' || last.comment)) {
      this.push('');
    }
  }

  render(): string {
    return this.lines.map(l => (l.comment ? (l.text ? `${l.text} ${l.comment}` : l.comment) : l.text).replace(/\s+$/, '')).join('\n');
  }
}

function hasComment(node: Node): boolean {
  if (node.type === 'comment') return true;
  return node.children.some(c => c !== null && hasComment(c));
}

/** Comments the layout cannot place: inside literals, expressions... */
function hasStrayComment(node: Node): boolean {
  for (const c of node.children) {
    if (!c) continue;
    if (c.type === 'comment' && !COMMENT_PARENTS.has(node.type)) return true;
    if (hasStrayComment(c)) return true;
  }
  return false;
}

function oneLineInSource(node: Node): boolean {
  return node.startPosition.row === node.endPosition.row;
}

/** Leave a node exactly as written (re-indenting only its first line). */
function verbatim(node: Node, ind: string, out: Out): void {
  const [first, ...rest] = node.text.split('\n');
  out.push(ind + first);
  for (const line of rest) {
    out.push(line.replace(/\s+$/, ''));
  }
}

function pushComment(comment: Node, ind: string, out: Out): void {
  out.pushComment(ind, comment.text);
}

// ── Layout ──────────────────────────────────────────────────────────────

class Formatter {
  constructor(private readonly opts: FormatOptions) {}

  fits(ind: string, text: string): boolean {
    return (ind + text).replace(/\t/g, '    ').length <= this.opts.width;
  }

  /** Top-level components (or a directive block's contents). */
  components(nodes: Node[], ind: string, out: Out, prevEnd = -1): void {
    for (const node of nodes) {
      if (prevEnd >= 0 && node.startPosition.row - prevEnd > 1) {
        out.blank();
      }
      if (node.type === 'comment') {
        if (prevEnd >= 0 && node.startPosition.row === prevEnd && out.lines.length > 0) {
          out.trail(node.text);
        } else {
          pushComment(node, ind, out);
        }
      } else {
        this.component(node, ind, out);
      }
      prevEnd = node.endPosition.row;
    }
  }

  component(node: Node, ind: string, out: Out): void {
    if (hasStrayComment(node)) {
      verbatim(node, ind, out);
      return;
    }
    switch (node.type) {
      case 'plan':
        this.plan(node, ind, out);
        return;
      case 'rule':
        this.rule(node, ind, out);
        return;
      case 'directive':
        this.directive(node, ind, out);
        return;
      default:
        out.push(ind + flat(node)); // beliefs and initial goals
    }
  }

  directive(node: Node, ind: string, out: Out): void {
    const kids = node.children.filter((c): c is Node => c !== null);
    if (!kids.some(c => c.type === 'begin')) {
      out.push(ind + flat(node));
      return;
    }
    // { begin name(args) } ... { end }
    const close = kids.findIndex(c => c.type === '}');
    const header = kids.slice(0, close + 1);
    out.push(ind + flat(...header));
    const endOpen = kids.length - 3;
    const body = kids.slice(close + 1, endOpen).filter(k => k.isNamed);
    this.components(body, ind, out, header[header.length - 1].endPosition.row);
    if (body.length && kids[endOpen].startPosition.row - body[body.length - 1].endPosition.row > 1) {
      out.blank();
    }
    out.push(ind + '{ end }');
  }

  rule(node: Node, ind: string, out: Out): void {
    const text = flat(node);
    if (oneLineInSource(node) && this.fits(ind, text)) {
      out.push(ind + text);
      return;
    }
    const head = node.childForFieldName('head')!;
    const body = node.childForFieldName('body')!;
    // Break the body at its top-level `&`s.
    const conjuncts: Node[] = [];
    const collect = (n: Node): void => {
      if (n.type === 'binary_expression' && n.childForFieldName('operator')?.type === '&') {
        collect(n.childForFieldName('left')!);
        collect(n.childForFieldName('right')!);
      } else {
        conjuncts.push(n);
      }
    };
    collect(body);
    out.push(`${ind}${flat(head)} :-`);
    conjuncts.forEach((c, i) => out.push(ind + this.opts.indent + flat(c) + (i < conjuncts.length - 1 ? ' &' : '.')));
  }

  plan(node: Node, ind: string, out: Out): void {
    const kidsAll = node.children.filter((c): c is Node => c !== null);
    // A comment between `:`/`<:` and its formula: keep the plan as written.
    if (kidsAll.some((c, i) => (c.type === ':' || c.type === '<:') && kidsAll[i + 1]?.type === 'comment')) {
      verbatim(node, ind, out);
      return;
    }
    const body = node.childForFieldName('body');
    const multiLineStatement = body ? body.namedChildren.some(c => c !== null && STATEMENTS.has(c.type) && !oneLineInSource(c)) : false;
    if (oneLineInSource(node) && !hasComment(node) && !multiLineStatement) {
      const text = flat(node);
      if (this.fits(ind, text)) {
        out.push(ind + text);
        return;
      }
    }
    const unit = this.opts.indent;
    let headOpen = false; // the trigger line is still open for `: context`
    let prevEnd = -1;
    const kids = node.children.filter((c): c is Node => c !== null);
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k.type === 'comment') {
        if (k.startPosition.row === prevEnd) {
          out.trail(k.text);
        } else {
          pushComment(k, ind + unit, out);
        }
        headOpen = false;
      } else if (k.type === 'label') {
        out.push(ind + flat(k));
      } else if (k.type === 'trigger') {
        out.push(ind + flat(k));
        headOpen = true;
      } else if (k.type === ':' || k.type === '<:') {
        const expr = kids[++i];
        const piece = `${k.type} ${flat(expr)}`;
        const last = out.lines[out.lines.length - 1];
        // stays on the trigger line only if written there (and it fits)
        const sameLine = k.startPosition.row === prevEnd;
        if (headOpen && sameLine && !last.comment && this.fits('', `${last.text} ${piece}`)) {
          out.append(' ' + piece, ind + unit);
        } else {
          out.push(ind + unit + piece);
        }
        headOpen = false;
        prevEnd = expr.endPosition.row;
        continue;
      } else if (k.type === '<-') {
        // Comments between `<-` and the first formula: `<-` gets a line.
        let j = i + 1;
        while (kids[j]?.type === 'comment') j++;
        const planBody = kids[j];
        const cont = ind + unit + '   ';
        if (j > i + 1) {
          out.push(ind + unit + '<-');
          let end = k.endPosition.row;
          for (const c of kids.slice(i + 1, j)) {
            if (c.startPosition.row === end) out.trail(c.text);
            else pushComment(c, cont, out);
            end = c.endPosition.row;
          }
          this.body(planBody, cont, cont, out, end);
        } else {
          // `<- a;` then the other formulas aligned under `a`
          this.body(planBody, ind + unit + '<- ', cont, out, k.endPosition.row);
        }
        i = j;
        headOpen = false;
        prevEnd = planBody.endPosition.row;
        continue;
      } else if (k.type === '.') {
        // after a trailing `;`, keep the `.` on its own line as written
        const last = out.lines[out.lines.length - 1];
        if (last && last.text.endsWith(';') && k.startPosition.row !== prevEnd) {
          out.push(ind + unit + '.');
        } else {
          out.append('.', ind + unit + '   ');
        }
      } else if (k.type === 'sub_plans') {
        out.append(' {', ind);
        const plans = k.children.filter((c): c is Node => c !== null && c.isNamed);
        this.components(plans, ind + unit, out, k.startPosition.row);
        out.push(ind + '}');
      }
      prevEnd = k.endPosition.row;
    }
  }

  /** Body formulas, the first after `firstPrefix`, the rest after `prefix`. */
  body(planBody: Node, firstPrefix: string, prefix: string, out: Out, prevEnd: number): void {
    let first = true;
    for (const c of planBody.children) {
      if (!c) continue;
      if (c.type === ';') {
        out.append(';', prefix);
      } else if (c.type === 'comment') {
        if (c.startPosition.row === prevEnd) {
          out.trail(c.text);
        } else {
          pushComment(c, prefix, out);
        }
      } else {
        const lead = first ? firstPrefix : prefix;
        first = false;
        if (STATEMENTS.has(c.type) && !oneLineInSource(c)) {
          this.statement(c, lead, prefix, out);
        } else {
          out.push(lead + flat(c));
        }
      }
      prevEnd = c.endPosition.row;
    }
  }

  /** if/elif/else, for and while over several lines. */
  statement(node: Node, lead: string, col: string, out: Out): void {
    const inner = col + this.opts.indent;
    const block = (b: Node | null): void => {
      if (!b) return;
      let prevEnd = b.startPosition.row;
      for (const c of b.children) {
        if (!c) continue;
        if (c.type === 'plan_body') {
          this.body(c, inner, inner, out, prevEnd);
        } else if (c.type === 'comment') {
          if (c.startPosition.row === prevEnd) out.trail(c.text);
          else pushComment(c, inner, out);
        }
        prevEnd = c.endPosition.row;
      }
    };
    const head = (n: Node, keyword: string): string => `${keyword} (${flat(n.childForFieldName('condition')!)}) {`;
    if (node.type === 'if_statement') {
      out.push(lead + head(node, 'if'));
      block(node.childForFieldName('consequence'));
      let alt = node.childForFieldName('alternative');
      while (alt) {
        if (alt.type === 'elif_clause') {
          out.push(col + '} ' + head(alt, 'elif'));
          block(alt.childForFieldName('consequence'));
          alt = alt.childForFieldName('alternative');
        } else {
          out.push(col + '} else {');
          block(alt.childForFieldName('body'));
          alt = null;
        }
      }
    } else {
      out.push(lead + head(node, node.type === 'for_statement' ? 'for' : 'while'));
      block(node.childForFieldName('body'));
    }
    out.push(col + '}');
  }
}

/** Token texts, comments included (minus trailing blanks on their lines). */
function tokenTexts(root: Node): string[] {
  return leaves(root).map(t => (t.type === 'comment' ? t.text.replace(/[ \t]+$/gm, '') : t.text));
}

/**
 * Format a parsed document. Returns null when it has syntax errors, or when
 * the result would not hold exactly the same tokens and comments (a safety
 * net: formatting must never change or lose code).
 */
export function format(tree: Tree, opts: FormatOptions): string | null {
  const root = tree.rootNode;
  if (root.hasError) {
    return null;
  }
  const out = new Out();
  new Formatter(opts).components(root.children.filter((c): c is Node => c !== null), '', out);
  const rendered = out.render().replace(/^\n+/, '');
  const text = rendered ? rendered + '\n' : '';
  const check = parse(text);
  try {
    const same = !check.rootNode.hasError && tokenTexts(check.rootNode).join('\u0000') === tokenTexts(root).join('\u0000');
    return same ? text : null;
  } finally {
    check.delete();
  }
}
