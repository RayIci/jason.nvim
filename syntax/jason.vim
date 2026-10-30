" Vim syntax file
" Language:    Jason (AgentSpeak) agent programs
" Filenames:   *.asl
" Reference:   jason-interpreter/src/main/javacc/jason/asSyntax/parser/AS2JavaParser.jj

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn case match
syn sync minlines=200

" Atoms and functors {{{1
" Atoms start lowercase (or with '.' for internal actions) and may contain
" dots, so `my.lib.action` is a single token, as in the parser.
syn match   jasonFunctor        "\<\l\w*\%(\.\l\w*\)*\ze("
syn match   jasonNamespace      "\<\l\w*\ze::"
syn match   jasonNamespaceSep   "::"

" Internal actions: `.print`, `.my_pkg.action`. The dot must not follow a word
" character or closing bracket, which keeps the plan-ending '.' out.
syn match   jasonInternalAction "\%(\w\|[)\]'\"]\)\@<!\.\l\w*\%(\.\l\w*\)*"

" Variables {{{1
syn match   jasonVariable       "\<\u\w*\>"
syn match   jasonAnonVar        "\<_\w*\>"

" Literals {{{1
syn keyword jasonBoolean        true false
syn match   jasonNumber         "\<\d\+\%(\.\d\+\)\=\%([eE][+-]\=\d\+\)\=\>"
syn match   jasonNumber         "\.\d\+\%([eE][+-]\=\d\+\)\=\>"
syn match   jasonEscape         contained "\\\%([ntbrf\\'\"]\|\o\{1,3}\)"
syn region  jasonString         start=+"+ skip=+\\\\\|\\"+ end=+"+ oneline contains=jasonEscape,@Spell
syn region  jasonQuotedAtom     start=+'+ end=+'+ oneline

" Keywords and operators {{{1
syn keyword jasonConditional    if elif else
syn keyword jasonRepeat         for while
syn keyword jasonOperator       not div mod
syn match   jasonOperator       "=\.\.\|\\==\|==\|<=\|>=\|\*\*\||&|\||||"
syn match   jasonNegation       "\~"
syn match   jasonArrow          "<-\|<:\|:-"

" Plans {{{1
" Plan labels: `@label`, `@label[atomic]`, `@[atomic]`.
syn match   jasonLabel          "@\%(\l\w*\)\="

" Triggering events at the start of a plan: +b -b +!g -!g +?q -?q ^!g ^?g
syn match   jasonTrigger        "^\s*\%(@\S*\s\+\)\=\zs\%([+-]\|\^\)[!?]\=\ze\s*[[:lower:]~'.]"

" Body formulas: !g !!g ?q and the belief updates +b -b -+b +<b +>b.
syn match   jasonGoal           "!!\=\ze\s*[[:lower:]~'.A-Z_]"
syn match   jasonGoal           "?\ze\s*[[:lower:]~'.A-Z_]"
" Defined after jasonTrigger so it wins on body lines that start with + or -.
syn match   jasonBeliefUpdate   "\%(\%(<-\|;\|{\|}\)\_s*\)\@80<=\%(-+\|+[<>]\|[+-]\)\ze\s*[[:lower:]~'A-Z_]"

" The '.' that closes a belief, rule, goal or plan.
syn match   jasonEnd            "\.\ze\s*\%(//.*\|/\*.*\)\=$"

" Directives: { include("f.asl") }, { begin namespace(ns) } ... { end } {{{1
syn match   jasonDirective      "{\s*\zs\%(include\|register_function\|namespace\|begin\|end\)\>"

" Well-known annotations and communication performatives {{{1
syn keyword jasonAnnotation     source self percept atomic breakpoint all_unifs priority
syn keyword jasonPerformative   tell untell achieve unachieve askOne askAll askHow tellHow untellHow signal

" Comments {{{1
syn keyword jasonTodo           contained TODO FIXME XXX NOTE
syn match   jasonComment        "//.*$" contains=jasonTodo,@Spell
syn region  jasonComment        start="/\*" end="\*/" contains=jasonTodo,@Spell fold

" Highlight links {{{1
hi def link jasonFunctor        Function
hi def link jasonNamespace      Structure
hi def link jasonNamespaceSep   Delimiter
hi def link jasonInternalAction Special
hi def link jasonVariable       Identifier
hi def link jasonAnonVar        Identifier
hi def link jasonBoolean        Boolean
hi def link jasonNumber         Number
hi def link jasonEscape         SpecialChar
hi def link jasonString         String
hi def link jasonQuotedAtom     Constant
hi def link jasonConditional    Conditional
hi def link jasonRepeat         Repeat
hi def link jasonOperator       Operator
hi def link jasonNegation       Operator
hi def link jasonArrow          Operator
hi def link jasonLabel          Label
hi def link jasonTrigger        Statement
hi def link jasonGoal           Keyword
hi def link jasonBeliefUpdate   Statement
hi def link jasonEnd            Delimiter
hi def link jasonDirective      PreProc
hi def link jasonAnnotation     Type
hi def link jasonPerformative   Constant
hi def link jasonTodo           Todo
hi def link jasonComment        Comment

let b:current_syntax = "jason"

let &cpo = s:cpo_save
unlet s:cpo_save

" vim: foldmethod=marker
