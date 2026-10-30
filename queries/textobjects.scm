; nvim-treesitter-textobjects

(plan) @function.outer

(plan
  body: (plan_body) @function.inner)

(rule) @function.outer

(rule
  body: (_) @function.inner)

(plan
  context: (_) @conditional.inner)

[
  (if_statement)
  (elif_clause)
  (else_clause)
] @conditional.outer

(block
  (plan_body) @block.inner) @block.outer

[
  (for_statement)
  (while_statement)
] @loop.outer

(for_statement
  body: (block) @loop.inner)

(while_statement
  body: (block) @loop.inner)

(arguments
  "," @parameter.outer
  .
  (_) @parameter.inner @parameter.outer)

(arguments
  .
  (_) @parameter.inner @parameter.outer
  .
  ","? @parameter.outer)

(comment) @comment.outer
