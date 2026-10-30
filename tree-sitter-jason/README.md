# tree-sitter-jason

[Jason](https://github.com/jason-lang/jason) (AgentSpeak) grammar for
[tree-sitter](https://tree-sitter.github.io/tree-sitter/).

The grammar follows the JavaCC parser of the Jason interpreter
(`AS2JavaParser.jj`). It covers:

- beliefs, rules and initial goals
- plans: labels, triggers, context, goal conditions (`<:`), bodies and sub-plans
- body formulas: `!`/`!!` goals, `?` tests, belief updates (`+ - -+ ++ -- +< +>`),
  `|&|` / `|||` and grouped bodies
- `if`/`elif`/`else`, `for`, `while`
- plan terms (`{+!g <- a}`)
- directives, including `{ begin ... } ... { end }` blocks
- namespaces (`ns::lit`), strong negation, annotations, lists with tails
- the full expression syntax

Every `.asl` program bundled with Jason 3.3 parses without errors.

## Queries

`queries/` uses Neovim capture names:

| File               | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `highlights.scm`   | syntax highlighting                                            |
| `folds.scm`        | plans, rules, directive blocks, `{ }` blocks, comments         |
| `textobjects.scm`  | [nvim-treesitter-textobjects](https://github.com/nvim-treesitter/nvim-treesitter-textobjects): plans as functions, bodies, conditionals, loops, arguments |
| `locals.scm`       | clause scopes for variables                                    |

## Neovim

[jason.nvim](https://github.com/RayIci/jason.nvim) registers this parser with
nvim-treesitter, so `:TSInstall jason` is enough. Without jason.nvim:

```lua
vim.api.nvim_create_autocmd("User", {
  pattern = "TSUpdate",
  callback = function()
    require("nvim-treesitter.parsers").jason = {
      install_info = {
        url = "https://github.com/RayIci/tree-sitter-jason",
        queries = "queries",
      },
    }
  end,
})
vim.filetype.add({ extension = { asl = "jason" } })
```

## Development

```sh
tree-sitter generate   # after editing grammar.js
tree-sitter test       # corpus in test/corpus/
tree-sitter parse path/to/agent.asl
```

`src/` is generated but committed, so installing the parser needs only a C
compiler.

## License

[MIT](LICENSE)
