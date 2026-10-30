# jason-language-server

A [Language Server](https://microsoft.github.io/language-server-protocol/) for
[Jason](https://github.com/jason-lang/jason) (AgentSpeak) agent programs
(`.asl`), part of [jason.nvim](https://github.com/RayIci/jason.nvim). It
parses with the grammar in `../tree-sitter-jason`, compiled to WebAssembly,
so it needs only Node.js.

## Features

- **Diagnostics**
  - every syntax error, with missing tokens named (`missing ';'`)
  - singleton variables, like Jason's own warning; sub-plans share variables
    with the plans around them
- **Outline**: plans (with label and context), nested sub-plans, rules,
  beliefs, initial goals, directives and namespace blocks. Workspace symbol
  search too.
- **Go to definition**
  - goal → the plans that handle it
  - test goal or query → the beliefs and rules that define it
  - `{ include("x.asl") }` → the file
  - user internal action `lib.act` → its Java source `lib/act.java`

  It looks in the agent's file and its includes first, then the whole workspace.
- **References** of a belief or goal across the workspace, including message
  contents such as `.send(alice, tell, hi)` → `+hi`.
- **Hover**
  - documentation for the 112 standard internal actions (extracted from the
    Jason jar)
  - the plans that handle a goal
  - where a belief is defined
- **Formatting**
  - plans and rules written on one line stay that way when they fit
  - longer ones get the context under the trigger and one body formula per
    line, aligned after `<-`; rules break at their top-level `&`
  - `if`/`for`/`while` blocks and sub-plans are indented
  - spacing is normalised; comments and single blank lines are kept
  - the result is re-parsed and must hold exactly the same tokens and comments,
    otherwise nothing is changed. Files with syntax errors aren't formatted.
- **Completion**
  - internal actions after `.`
  - goals after `!` / `!!` / `+!`, with the plan's parameters as placeholders
  - beliefs and rules
  - performatives in `.send` / `.broadcast`
  - the variables of the current clause

## Install

```sh
git clone https://github.com/RayIci/jason.nvim
cd jason.nvim/server
npm ci
npm run build
npm link        # puts `jason-language-server` on PATH
```

Run it with `jason-language-server --stdio`.

## Editors

**Neovim**: jason.nvim builds this server (`:Jason build-server`) and ships
the config (`lsp/jason_ls.lua`). Enable it with:

```lua
vim.lsp.enable("jason_ls")
```

**Other editors**: start `jason-language-server --stdio` for `.asl` files. The
workspace root should be the folder with the `.mas2j` file.

### Options

Set these as `initializationOptions`:

```json
{ "formatting": { "maxWidth": 100 } }
```

Indentation follows the editor's `tabSize` / `insertSpaces`.

## Development

```sh
npm test          # build, then end-to-end tests over stdio (test/fixtures/project)
npm run grammar   # rebuild grammar/tree-sitter-jason.wasm from ../tree-sitter-jason
npm run stdlib    # regenerate src/stdlib.json from the jason CLI's jar
```

## License

[MIT](LICENSE)
