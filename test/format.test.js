// Formatter tests on source snippets (dist/format.js directly).

import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { format } from '../dist/format.js';
import { initParser, parse } from '../dist/parser.js';

before(() => initParser());

const opts = { indent: '    ', width: 60 };
function fmt(src, o = opts) {
  const tree = parse(src);
  try {
    return format(tree, o);
  } finally {
    tree.delete();
  }
}
const lines = (...l) => l.join('\n') + '\n';

test('keeps short one-line plans on one line, with normalised spacing', () => {
  assert.equal(fmt('+!start:true<-.print("hi");!!loop(_,X).\n'), '+!start : true <- .print("hi"); !!loop(_, X).\n');
});

test('breaks plans that do not fit', () => {
  assert.equal(
    fmt('+!go(A,B) : ready(A) & ready(B) <- move(A); move(B); .print("moved both of them").\n'),
    lines('+!go(A, B) : ready(A) & ready(B)', '    <- move(A);', '       move(B);', '       .print("moved both of them").'),
  );
});

test('lays out multi-line plans: context placement as written, aligned bodies', () => {
  assert.equal(
    fmt('@l[atomic]\n+!g(X)\n  :  c(X)\n  <-  a(X);\n        b.\n'),
    lines('@l[atomic]', '+!g(X)', '    : c(X)', '    <- a(X);', '       b.'),
  );
});

test('indents if/elif/else, for and while blocks', () => {
  assert.equal(
    fmt('+!g <- if (X > 1) {\n a } elif (X == 1) { b\n } else { c }; for (.member(Y, L)) {\n.print(Y) }.\n'),
    lines(
      '+!g',
      '    <- if (X > 1) {',
      '           a',
      '       } elif (X == 1) {',
      '           b',
      '       } else {',
      '           c',
      '       };',
      '       for (.member(Y, L)) {',
      '           .print(Y)',
      '       }.',
    ),
  );
});

test('nests sub-plans', () => {
  assert.equal(fmt('+!outer <- !inner. {\n+!inner <- .print(in).\n}\n'), lines('+!outer', '    <- !inner. {', '    +!inner <- .print(in).', '}'));
});

test('breaks long rules at the top-level &', () => {
  assert.equal(
    fmt('all_received(Id, NP) :- .count(propose(Id, _), NO) & .count(refuse(Id), NR) & NP = NO + NR.\n'),
    lines('all_received(Id, NP) :-', '    .count(propose(Id, _), NO) &', '    .count(refuse(Id), NR) &', '    NP = NO + NR.'),
  );
});

test('keeps comments, their order, and single blank lines', () => {
  const src = lines(
    '// header',
    '',
    '',
    '+!g // the goal',
    '    <- // first step',
    '       a; // after a',
    '       // before b',
    '       b;',
    '    .',
    '',
    '/* block',
    '',
    '',
    '   keeps its blank lines */',
  );
  assert.equal(
    fmt(src),
    lines(
      '// header',
      '',
      '+!g // the goal',
      '    <- // first step',
      '       a; // after a',
      '       // before b',
      '       b;',
      '    .',
      '',
      '/* block',
      '',
      '',
      '   keeps its blank lines */',
    ),
  );
});

test('leaves a clause verbatim when a comment sits inside a literal', () => {
  const src = '+!g <- .print(a, // why\n    b).\n';
  assert.equal(fmt(src), src);
});

test('keeps directive blocks unindented', () => {
  assert.equal(
    fmt('{include("a.asl")}\n{ begin namespace(ns,local) }\nb(1).\n{ end }\n'),
    lines('{ include("a.asl") }', '{ begin namespace(ns, local) }', 'b(1).', '{ end }'),
  );
});

test('refuses to format code with syntax errors', () => {
  assert.equal(fmt('+!g <- a b.\n'), null);
});

test('is idempotent', () => {
  const src = '+!g(A,B):c(A)&d(B)<-a(A);if(A>B){b}else{c};!!g(B,A).\n';
  const once = fmt(src);
  assert.equal(fmt(once), once);
});
