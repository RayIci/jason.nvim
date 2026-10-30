-- jason-language-server: bundled in server/ (build it with :Jason build-server),
-- else `jason-language-server` from PATH.
-- Enable with vim.lsp.enable("jason_ls").
local paths = require("jason.paths")

---@type vim.lsp.Config
return {
  cmd = vim.uv.fs_stat(paths.server_main) and { "node", paths.server_main, "--stdio" }
    or { "jason-language-server", "--stdio" },
  filetypes = { "jason" },
  -- The project root holds the .mas2j file; fall back to the git root.
  root_dir = function(bufnr, on_dir)
    on_dir(vim.fs.root(bufnr, function(name)
      return name:match("%.mas2j$") ~= nil
    end) or vim.fs.root(bufnr, ".git"))
  end,
}
