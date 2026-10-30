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
- **`:Jason` command** wrapping the [Jason CLI](https://github.com/jason-lang/jason/tree/main/jason-cli):
  run, compile, stop, Mind Inspector, new app, add agent.

Highlighting uses classic Vim syntax files, written from the official JavaCC
grammars. There is no tree-sitter parser for Jason yet (see the [roadmap](#roadmap)).

## Requirements

- Neovim ≥ 0.11
- For `:Jason`: the `jason` CLI in `PATH` (Java 17+). See the
  [installation guide](https://github.com/jason-lang/jason/blob/main/doc/install.adoc).

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
  run_args = {},                        -- extra args for `jason <app>.mas2j`
  mind_url = "http://127.0.0.1:3272",   -- opened by :Jason mind
  runner = "terminal",                  -- or fun(spec) to use your own task runner
  terminal = { position = "botright", size = 15 },
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
- [ ] **Linting**: a small wrapper around the parser in the Jason jar that
      reports `file:line:col: message`, plus an
      [nvim-lint](https://github.com/mfussenegger/nvim-lint) linter definition
- [ ] **Formatting**: re-indent plan bodies and normalise spacing around
      `:`, `<-` and `;` (a Lua formatter usable from
      [conform.nvim](https://github.com/stevearc/conform.nvim))
- [ ] JaCaMo support: `.jcm` project files
- [ ] **Tree-sitter grammar** (`tree-sitter-jason`), generated from
      `AS2JavaParser.jj`: better highlighting, text objects (plans, bodies),
      folding, and a symbol outline
- [ ] **Language server**: go to definition across plans and includes, plan
      and belief outline, completion of beliefs, goals and internal actions,
      and diagnostics

## Development

```sh
nvim --clean --headless -l tests/run.lua
```

This checks filetype detection, the syntax group at each construct in
`tests/fixtures/`, that re-indenting the fixtures leaves them unchanged, and
the `:Jason` command.

## Credits

- Language reference: the JavaCC grammars in
  [jason-lang/jason](https://github.com/jason-lang/jason) by Jomi F. Hübner,
  Rafael H. Bordini and contributors.

## License

[MIT](LICENSE)
