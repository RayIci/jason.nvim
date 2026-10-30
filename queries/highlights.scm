; Jason (AgentSpeak) highlights, Neovim capture names.
; Later patterns take precedence over earlier ones.

; Terms
(variable) @variable

(anonymous_variable) @variable.builtin

(atom) @constant

(quoted_atom) @string.special.symbol

(number) @number

[
  (true)
  (false)
] @boolean

(string) @string

(escape_sequence) @string.escape

(comment) @comment @spell

; Functors: structures with arguments are calls, internal actions builtins
(literal
  functor: (atom) @function.call
  arguments: (arguments))

(internal_action) @function.call

((internal_action) @function.builtin
  (#lua-match? @function.builtin "^%."))

(namespace
  functor: (atom) @module)

; Plans: the event a plan handles and the goals that post events
(trigger
  literal: (literal
    functor: (atom) @function))

(achieve
  literal: (literal
    functor: (atom) @function))

(rule
  head: (literal
    functor: (atom) @function))

(trigger
  [
    "+"
    "-"
    "^"
    "!"
    "?"
  ] @keyword)

(achieve
  [
    "!"
    "!!"
  ] @keyword)

(test_goal
  "?" @keyword)

(belief_update
  operator: _ @keyword)

(initial_goal
  "!" @keyword)

(label
  "@" @label)

(label
  name: (atom) @label)

; Annotations: p[source(self)], @l[atomic]
(literal
  annotations: (list
    (literal
      functor: (atom) @attribute)))

(label
  annotations: (list
    (literal
      functor: (atom) @attribute)))

((atom) @constant.builtin
  (#any-of? @constant.builtin
    "tell" "untell" "achieve" "unachieve" "askOne" "askAll" "askHow" "tellHow" "untellHow" "signal"
    "self" "percept"))

; Directives
(directive
  (atom) @keyword.directive)

(directive
  [
    "begin"
    "end"
  ] @keyword.directive)

; Keywords and operators
[
  "if"
  "elif"
  "else"
] @keyword.conditional

[
  "for"
  "while"
] @keyword.repeat

[
  "<-"
  ":-"
  "<:"
  "|||"
  "|&|"
  "~"
] @operator

(plan
  ":" @operator)

(plan_term
  ":" @operator)

(binary_expression
  operator: _ @operator)

(unary_expression
  operator: _ @operator)

; after the binary operators, so `div` and `mod` stay keywords
[
  "not"
  "div"
  "mod"
] @keyword.operator

; Punctuation
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  ";"
  "."
  "::"
] @punctuation.delimiter

(list
  "|" @punctuation.delimiter)
