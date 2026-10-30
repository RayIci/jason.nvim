" Vim syntax file
" Language:    Jason multi-agent system project files
" Filenames:   *.mas2j
" Reference:   jason-interpreter/src/main/javacc/jason/mas2j/parser/MAS2JavaParser.jj

if exists("b:current_syntax")
  finish
endif

let s:cpo_save = &cpo
set cpo&vim

syn case match

" Sections
syn keyword mas2jKeyword       MAS
syn keyword mas2jSection       agents environment executionControl infrastructure
syn keyword mas2jSection       classpath aslSourcePath directives
syn keyword mas2jKeyword       at

" Agent options, inside [ ... ] or after the agent name
syn keyword mas2jOption        events intBels nrcbp verbose synchronised
syn keyword mas2jOption        agentClass agentArchClass beliefBaseClass
syn keyword mas2jValue         discard requeue retrieve sameFocus newFocus
syn keyword mas2jBoolean       true false

" Java classes: example.Env, jason.architecture.AgArch
syn match   mas2jClass         "\<\%(\l\w*\.\)*\u\w*\>"

" Agent multiplicity: bob #3
syn match   mas2jCount         "#\d\+"

syn match   mas2jNumber        "\<\d\+\%(\.\d\+\)\=\%([eE][+-]\=\d\+\)\=\>"
syn match   mas2jEscape        contained "\\\%([ntbrf\\'\"]\|\o\{1,3}\)"
syn region  mas2jString        start=+"+ skip=+\\\\\|\\"+ end=+"+ oneline contains=mas2jEscape
syn match   mas2jDelimiter     "[:;]"

syn keyword mas2jTodo          contained TODO FIXME XXX NOTE
syn match   mas2jComment       "//.*$" contains=mas2jTodo,@Spell
syn region  mas2jComment       start="/\*" end="\*/" contains=mas2jTodo,@Spell fold

hi def link mas2jKeyword       Keyword
hi def link mas2jSection       Statement
hi def link mas2jOption        Type
hi def link mas2jValue         Constant
hi def link mas2jBoolean       Boolean
hi def link mas2jClass         Structure
hi def link mas2jCount         Number
hi def link mas2jNumber        Number
hi def link mas2jEscape        SpecialChar
hi def link mas2jString        String
hi def link mas2jDelimiter     Delimiter
hi def link mas2jTodo          Todo
hi def link mas2jComment       Comment

let b:current_syntax = "mas2j"

let &cpo = s:cpo_save
unlet s:cpo_save
