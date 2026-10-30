# jason.nvim

Neovim support for [Jason](https://github.com/jason-lang/jason), the BDI
agent-oriented language based on AgentSpeak.

```agentspeak
!start.

@greet[atomic]
+!start : true
    <- .print("hello world.");
       +greeted;
       !!loop.
```

## Features

- **Filetype detection**: `*.asl` → `jason`, `*.mas2j` → `mas2j`.
- **Syntax highlighting** for agent programs and project files. It covers:
  - triggering events (`+!g`, `-?q`, `^!g`) and plan labels (`@l[atomic]`)
  - goals (`!`, `!!`, `?`) and belief updates (`+b`, `-b`, `-+b`)
  - internal actions (`.print`, `my.lib.action`) and directives (`{ include(...) }`)
  - variables, strong negation (`~`), the operators `<-`, `:-` and `<:`
  - `if`/`elif`/`else`/`for`/`while`, annotations, and performatives
  - comments and strings
- **Indentation** in the style of `jason app create`: the plan context and body
  are indented under the trigger, body formulas line up after `<-`, and `{ }`
  blocks are handled.
- **Buffer settings**: `//` and `/* */` comments, so `gc` works out of the box,
  and 4-space indents.
- **Snippets** in VS Code format for plans, rules, `if`/`for`/`while`, `.send`,
  namespaces, and `MAS` projects.
- **Linting** with the parser shipped in the Jason jar, through
  [nvim-lint](https://github.com/mfussenegger/nvim-lint): syntax errors in
  agent programs and project files, unsaved buffers included.
- **Formatting** (whitespace and indentation only) through
  [conform.nvim](https://github.com/stevearc/conform.nvim) or `:Jason format`.
- **`:Jason` command** wrapping the [Jason CLI](https://github.com/jason-lang/jason/tree/main/jason-cli):
  run, compile, stop, Mind Inspector, new app, add agent.

Highlighting uses [tree-sitter-jason](https://github.com/RayIci/tree-sitter-jason)
when its parser is installed, and Vim syntax files (written from the official
JavaCC grammars) otherwise.

## Requirements

- Neovim ≥ 0.11
- For `:Jason` and linting: the `jason` CLI in `PATH` (Java 17+). See the
  [installation guide](https://github.com/jason-lang/jason/blob/main/doc/install.adoc).
- For tree-sitter highlighting (optional):
  [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter)
  (`main` branch) and a C compiler.
- For linting: [nvim-lint](https://github.com/mfussenegger/nvim-lint), and
  `javac` for the faster compiled checker (optional).

## Installation

**vim.pack** (Neovim 0.12+)

```lua
vim.pack.add({ "https://github.com/RayIci/jason.nvim" })
```

**lazy.nvim**

```lua
{ "RayIci/jason.nvim", ft = { "jason", "mas2j" }, cmd = "Jason" }
```

Plain `packpath` also works: clone the repo into
`~/.local/share/nvim/site/pack/plugins/start/`.

You don't need to call `setup()` for any of the features.

## Configuration

Call `setup()` only to change the defaults (or set `vim.g.jason` to the same table):

```lua
require("jason").setup({
  cmd = "jason",                        -- Jason CLI executable
  jar = nil,                            -- Jason jar for linting (default: the `cmd` launcher)
  run_args = {},                        -- extra args for `jason <app>.mas2j`
  mind_url = "http://127.0.0.1:3272",   -- opened by :Jason mind
  runner = "terminal",                  -- or fun(spec) to use your own task runner
  terminal = { position = "botright", size = 15 },
  treesitter = {
    highlight = true,                   -- start tree-sitter when the parser is installed
    url = "https://github.com/RayIci/tree-sitter-jason",
    revision = nil,                     -- pin a commit for :TSInstall
    path = nil,                         -- or install from a local checkout
  },
})
```

The plugin sets 4-space indentation in Jason buffers. To keep your own
settings instead:

```lua
vim.g.jason_recommended_style = false
```

### Custom runner

`runner` gets `{ name, cmd, cwd }`. For example, with
[overseer.nvim](https://github.com/stevearc/overseer.nvim):

```lua
require("jason").setup({
  runner = function(spec)
    local task = require("overseer").new_task({ name = spec.name, cmd = spec.cmd, cwd = spec.cwd })
    task:start()
    require("overseer").open({ enter = false })
  end,
})
```

## Usage

| Command                  | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `:Jason run [file]`      | Run the given `.mas2j`, or the nearest one above the buffer    |
| `:Jason compile`         | `jason app compile` in the project root                        |
| `:Jason stop`            | Stop the system started by the built-in terminal runner        |
| `:Jason mind`            | Open the Mind Inspector in the browser                         |
| `:Jason format`          | Format the current buffer                                      |
| `:Jason new {name}`      | `jason app create {name}` in the current directory             |
| `:Jason add-agent {name}`| `jason app add-agent {name}` in the project root               |

If a directory holds several `.mas2j` files, you're asked to pick one.
`new` and `add-agent` ask for the name when you leave it out.

### Mappings

The plugin defines no keys. These `<Plug>` mappings are available:

```lua
vim.keymap.set("n", "<leader>jr", "<Plug>(jason-run)")
vim.keymap.set("n", "<leader>jc", "<Plug>(jason-compile)")
vim.keymap.set("n", "<leader>js", "<Plug>(jason-stop)")
vim.keymap.set("n", "<leader>jm", "<Plug>(jason-mind)")
```

### Tree-sitter

jason.nvim registers the `jason` parser with nvim-treesitter, so install it once:

```vim
:TSInstall jason
```

From then on, jason buffers use tree-sitter highlighting with the grammar's
queries: highlights, folds, locals, and text objects for
[nvim-treesitter-textobjects](https://github.com/nvim-treesitter/nvim-treesitter-textobjects).
Plans are `@function`, bodies `@function.inner`, and there are conditionals,
loops and arguments too. Indentation stays with the plugin's own rules.

If your config starts tree-sitter and its indentation for every installed
parser, leave `jason` out of that list: the plugin starts highlighting itself.
For tree-sitter folding:

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "jason",
  callback = function()
    vim.wo.foldmethod = "expr"
    vim.wo.foldexpr = "v:lua.vim.treesitter.foldexpr()"
  end,
})
```

`.mas2j` files keep the Vim syntax; they're small and rarely edited.

### Linting

The plugin provides a `jasonlint` linter for nvim-lint:

```lua
require("lint").linters_by_ft.jason = { "jasonlint" }
require("lint").linters_by_ft.mas2j = { "jasonlint" }
```

It runs the parsers bundled in the Jason jar (found through the `jason`
launcher, or the `jar` option) on the buffer contents. The first check
compiles `tools/JasonLint.java` into Neovim's cache directory in the
background. After that, a check takes about 0.25 s.

The Jason parser stops at the first error, so you see one diagnostic at a
time. Directives that a project registers in its `.mas2j` (`directives: ld =
my.Directive;`) can't be checked on their own; they show up as a warning and
the rest of the file is skipped.

You can also run the checker from a shell:

```sh
java -cp "$(readlink -f "$(command -v jason)")" tools/JasonLint.java src/agt/bob.asl
```

### Formatting

The plugin provides a `jasonfmt` formatter for conform.nvim:

```lua
require("conform").formatters_by_ft.jason = { "jasonfmt" }
require("conform").formatters_by_ft.mas2j = { "jasonfmt" }
```

Without conform, use `:Jason format`. The formatter only changes
whitespace, outside strings, quoted atoms and comments:

- one space around `<-`, `:-`, `<:`, `&` and the context `:` (`|&|` and `|||`
  stay as they are);
- no space before `,` and `;`, one after;
- trailing whitespace removed, runs of blank lines collapsed to one;
- re-indented with the plugin's indent rules.

```agentspeak
+!start:true<-.print("hi");!!loop(_,X).        // before
+!start : true <- .print("hi"); !!loop(_, X).  // after
```

It doesn't break long lines or move plan bodies onto their own lines.

### Snippets

The snippets live in `snippets/`, with a `package.json` at the plugin root.

- **LuaSnip** finds them through `require("luasnip.loaders.from_vscode").lazy_load()`.
- **blink.cmp** only scans the paths it's given, so add the plugin's root:

```lua
sources = {
  providers = {
    snippets = {
      opts = {
        search_paths = {
          vim.fn.stdpath("config") .. "/snippets",
          vim.api.nvim_get_runtime_file("syntax/jason.vim", false)[1]:gsub("/syntax/jason.vim$", ""),
        },
      },
    },
  },
},
```

### Highlight groups

Every group is linked to a standard group (`Statement`, `Keyword`, `Special`,
and so on), so any colorscheme works. To restyle one:

```lua
vim.api.nvim_set_hl(0, "jasonTrigger", { link = "Keyword" })
```

Main groups: `jasonTrigger`, `jasonGoal`, `jasonBeliefUpdate`,
`jasonInternalAction`, `jasonFunctor`, `jasonVariable`, `jasonLabel`,
`jasonAnnotation`, `jasonPerformative`, `jasonDirective`, `jasonArrow`,
`jasonEnd`. The `mas2j` groups are `mas2jSection`, `mas2jOption`,
`mas2jClass` and so on.

## Roadmap

- [x] Filetype detection for `.asl` and `.mas2j`
- [x] Buffer settings (comments, indent width, matchpairs)
- [x] Syntax highlighting for agent programs and project files
- [x] Indentation for plans, bodies, and `{ }` blocks
- [x] Snippets (VS Code format)
- [x] `:Jason` command: run, compile, stop, Mind Inspector, new app, add agent
- [x] **Linting** with the parser in the Jason jar, through nvim-lint
- [x] **Formatting**: spacing and indentation, through conform.nvim or `:Jason format`
- [x] **Tree-sitter grammar**: [tree-sitter-jason](https://github.com/RayIci/tree-sitter-jason)
      with highlights, folds, text objects and locals
- [ ] **Full formatting**: break long lines and lay out plan bodies, on top
      of the tree-sitter grammar
- [ ] **Language server**: go to definition across plans and includes, plan
      and belief outline, completion of beliefs, goals and internal actions,
      and diagnostics

## Development

```sh
nvim --clean --headless -l tests/run.lua
nvim --clean --headless -l tests/lint.lua         # needs nvim-lint and the jason CLI
nvim --clean --headless -l tests/treesitter.lua   # needs ../tree-sitter-jason and cc
```

`tests/run.lua` checks filetype detection, the syntax group at each construct
in `tests/fixtures/`, that re-indenting the fixtures leaves them unchanged,
the formatter, and the `:Jason` command. `tests/lint.lua` runs the linter
through nvim-lint. `tests/treesitter.lua` builds the parser and checks
highlighting and indentation under tree-sitter.

## Credits

- Language reference: the JavaCC grammars in
  [jason-lang/jason](https://github.com/jason-lang/jason) by Jomi F. Hübner,
  Rafael H. Bordini and contributors.

## License

[MIT](LICENSE)
