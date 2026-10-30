/**
 * @file Jason (AgentSpeak) grammar for tree-sitter
 * @author Alex Valle
 * @license MIT
 *
 * Follows the JavaCC grammar of the Jason interpreter:
 * jason-interpreter/src/main/javacc/jason/asSyntax/parser/AS2JavaParser.jj
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  or: 1,
  and: 2,
  not: 3,
  rel: 4,
  add: 5,
  mul: 6,
  pow: 7,
  unary: 8,
};

const CHAR = /[a-zA-Z0-9_]/.source;

module.exports = grammar({
  name: 'jason',

  extras: $ => [/\s/, $.comment],

  word: $ => $.identifier,

  conflicts: $ => [
    // After `plan .`, `{` opens either its sub-plans or the next directive
    // (the Jason parser uses 4 tokens of lookahead here).
    [$.plan],
    // `( ... )` in a body is a parenthesized expression when it parses as
    // one (Jason tries that first), else a grouped plan body.
    [$._body_formula, $.parenthesized_expression],
    // `{+b ...}` as a term: Jason reads a trigger (a plan) first.
    [$.trigger, $._arith_primary],
  ],

  rules: {
    source_file: $ => repeat($._component),

    _component: $ => choice(
      $.belief,
      $.rule,
      $.initial_goal,
      $.plan,
      $.directive,
    ),

    // ── Beliefs, rules, initial goals ────────────────────────────────────

    belief: $ => seq(field('literal', $.literal), '.'),

    rule: $ => seq(
      field('head', $.literal),
      ':-',
      field('body', $._log_expr),
      '.',
    ),

    initial_goal: $ => seq('!', field('literal', $.literal), '.'),

    // ── Directives ───────────────────────────────────────────────────────

    directive: $ => choice(
      seq('{', $._directive_call, '}'),
      // `{ end }` closes the block rather than calling a directive `end`.
      prec(1, seq(
        '{', 'begin', $._directive_call, '}',
        repeat($._component),
        '{', 'end', '}',
      )),
    ),

    _directive_call: $ => seq(
      $._functor,
      optional(field('arguments', $.arguments)),
      optional(field('annotations', $.list)),
    ),

    // ── Plans ────────────────────────────────────────────────────────────

    plan: $ => seq(
      optional(field('label', $.label)),
      field('trigger', $.trigger),
      optional(seq(':', field('context', $._log_expr))),
      optional(seq('<:', field('goal_condition', $._log_expr))),
      optional(seq('<-', field('body', $.plan_body))),
      '.',
      optional(field('sub_plans', $.sub_plans)),
    ),

    sub_plans: $ => seq('{', repeat($.plan), '}'),

    label: $ => seq(
      '@',
      choice(
        seq(field('name', $._functor), optional(field('annotations', $.list))),
        field('annotations', $.list),
        // only valid in plan terms ({@L +!g <- b}); accepted everywhere
        field('name', $._variable),
      ),
    ),

    trigger: $ => prec.dynamic(1, seq(
      field('operator', choice('+', '-', '^')),
      optional(field('type', choice('!', '?'))),
      field('literal', $.literal),
    )),

    plan_body: $ => choice(
      seq(
        repeat1(choice(
          seq($._body_term, ';'),
          seq($._statement, optional(';')),
        )),
        optional($._body_term),
      ),
      $._body_term,
    ),

    _body_term: $ => choice($.parallel_or, $._body_factor),

    parallel_or: $ => prec.right(seq($._body_factor, '|||', $._body_term)),

    _body_factor: $ => choice($.parallel_and, $._body_formula),

    parallel_and: $ => prec.right(seq($._body_formula, '|&|', $._body_factor)),

    _body_formula: $ => choice(
      $.achieve,
      $.test_goal,
      $.belief_update,
      $._log_expr,
      $.body_group,
    ),

    achieve: $ => seq(
      field('operator', choice('!', '!!')),
      field('literal', $.literal),
    ),

    test_goal: $ => seq('?', field('formula', $._log_expr)),

    belief_update: $ => choice(
      // `-b` / `+b` at the start of a body formula is a belief update, not
      // unary arithmetic (Jason checks for the update prefix first).
      prec(PREC.unary + 1, seq(
        field('operator', choice('+', '++', '+<', '+>', '-', '-+', '--')),
        field('formula', $._arith_primary),
      )),
      seq(
        field('operator', choice('+', '++', '+<', '+>', '-', '-+', '--')),
        field('formula', $._log_expr),
      ),
    ),

    body_group: $ => seq('(', $.plan_body, ')'),

    _statement: $ => choice($.if_statement, $.for_statement, $.while_statement),

    if_statement: $ => seq('if', $._if_rest),

    _if_rest: $ => seq(
      '(', field('condition', $._log_expr), ')',
      field('consequence', $.block),
      optional(choice(
        field('alternative', $.elif_clause),
        field('alternative', $.else_clause),
      )),
    ),

    elif_clause: $ => seq('elif', $._if_rest),

    else_clause: $ => seq('else', field('body', $.block)),

    for_statement: $ => seq(
      'for', '(', field('condition', $._log_expr), ')',
      field('body', $.block),
    ),

    while_statement: $ => seq(
      'while', '(', field('condition', $._log_expr), ')',
      field('body', $.block),
    ),

    block: $ => seq('{', optional($.plan_body), '}'),

    // A plan or plan body written as a term: {+!g <- a}, {a; b}, {p :- q}.
    plan_term: $ => seq(
      '{',
      optional(choice(
        seq(
          optional(field('label', $.label)),
          field('trigger', $.trigger),
          optional(seq(':', field('context', $._log_expr))),
          optional(seq('<-', field('body', $.plan_body))),
        ),
        seq(
          field('body', $.plan_body),
          optional(seq(':-', field('rule_body', $._log_expr))),
        ),
      )),
      '}',
    ),

    // ── Literals and terms ───────────────────────────────────────────────

    literal: $ => choice(
      seq(
        optional(field('namespace', $.namespace)),
        optional(field('negation', '~')),
        choice($._structure, $._annotated_variable),
      ),
      $.true,
      $.false,
    ),

    namespace: $ => seq(optional(choice($._functor, $._variable)), '::'),

    _structure: $ => prec.right(seq(
      $._functor,
      optional(field('arguments', $.arguments)),
      optional(field('annotations', $.list)),
    )),

    _annotated_variable: $ => prec.right(seq(
      $._variable,
      optional(field('annotations', $.list)),
    )),

    _functor: $ => field('functor', choice(
      $.atom,
      $.internal_action,
      alias(choice('begin', 'end'), $.atom),
    )),

    arguments: $ => seq('(', commaSep1($._log_expr), ')'),

    list: $ => seq(
      '[',
      optional(seq(
        commaSep1($._list_item),
        optional(seq('|', field('tail', choice($._variable, $.list)))),
      )),
      ']',
    ),

    _list_item: $ => $._rel_operand,

    // ── Expressions (loosest to tightest) ────────────────────────────────

    _log_expr: $ => choice(
      alias($._log_binary, $.binary_expression),
      $.not_expression,
      $._rel_expr,
    ),

    _log_binary: $ => choice(
      prec.right(PREC.or, seq(
        field('left', $._log_expr), field('operator', '|'), field('right', $._log_expr),
      )),
      prec.right(PREC.and, seq(
        field('left', $._log_expr), field('operator', '&'), field('right', $._log_expr),
      )),
    ),

    not_expression: $ => prec(PREC.not, seq('not', field('operand', $._rel_expr))),

    _rel_expr: $ => choice(
      alias($._rel_binary, $.binary_expression),
      $._rel_operand,
    ),

    _rel_binary: $ => prec.left(PREC.rel, seq(
      field('left', $._rel_operand),
      field('operator', choice('<', '<=', '>', '>=', '==', '\\==', '=', '=..')),
      field('right', $._rel_operand),
    )),

    _rel_operand: $ => choice($._arith_expr, $.string, $.list, $.plan_term),

    _arith_expr: $ => choice(
      alias($._arith_binary, $.binary_expression),
      $.unary_expression,
      $._arith_primary,
    ),

    _arith_binary: $ => choice(
      prec.left(PREC.add, seq(
        field('left', $._arith_expr), field('operator', choice('+', '-')), field('right', $._arith_expr),
      )),
      prec.left(PREC.mul, seq(
        field('left', $._arith_expr),
        field('operator', choice('*', '/', 'div', 'mod')),
        field('right', $._arith_expr),
      )),
      prec.right(PREC.pow, seq(
        field('left', $._arith_expr), field('operator', '**'), field('right', $._arith_expr),
      )),
    ),

    unary_expression: $ => prec(PREC.unary, seq(
      field('operator', choice('+', '-')),
      field('operand', $._arith_primary),
    )),

    _arith_primary: $ => choice(
      $.number,
      $.parenthesized_expression,
      $.literal,
    ),

    parenthesized_expression: $ => prec.dynamic(1, seq('(', $._log_expr, ')')),

    // ── Tokens ───────────────────────────────────────────────────────────

    identifier: _ => /[a-z][a-zA-Z0-9_]*/,

    atom: $ => choice($.identifier, $.quoted_atom),

    quoted_atom: _ => /'[^']*'/,

    // Atoms with a dot are internal actions: .print, .my.lib, lib.action.
    internal_action: _ => token(choice(
      new RegExp(`(\\.${CHAR}+)+`),
      new RegExp(`[a-z]${CHAR}*(\\.${CHAR}+)+`),
    )),

    _variable: $ => choice($.variable, $.anonymous_variable),

    variable: _ => /[A-Z][a-zA-Z0-9_]*/,

    anonymous_variable: _ => /_[a-zA-Z0-9_]*/,

    number: _ => token(prec(1, choice(
      /\d+/,
      /\d*\.\d+([eE][+-]?\d+)?/,
      /\d+[eE][+-]?\d+/,
    ))),

    string: $ => seq(
      '"',
      repeat(choice(
        token.immediate(prec(1, /[^"\\\n]+/)),
        $.escape_sequence,
      )),
      token.immediate('"'),
    ),

    escape_sequence: _ => token.immediate(/\\([ntbrf\\'"]|[0-7]{1,3})/),

    true: _ => 'true',

    false: _ => 'false',

    comment: _ => token(choice(
      seq('//', /[^\r\n]*/),
      seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'),
    )),
  },
});

/**
 * @param {RuleOrLiteral} rule
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
