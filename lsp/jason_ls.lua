-- jason-language-server (https://github.com/RayIci/jason-language-server)
-- Enable with vim.lsp.enable("jason_ls").
---@type vim.lsp.Config
return {
  cmd = { "jason-language-server", "--stdio" },
  filetypes = { "jason" },
  -- The project root holds the .mas2j file; fall back to the git root.
  root_dir = function(bufnr, on_dir)
    on_dir(vim.fs.root(bufnr, function(name)
      return name:match("%.mas2j$") ~= nil
    end) or vim.fs.root(bufnr, ".git"))
  end,
}
