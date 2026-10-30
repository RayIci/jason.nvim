---tree-sitter integration: registers tree-sitter-jason with nvim-treesitter
---and starts tree-sitter highlighting in jason buffers when the parser is
---installed. Without a parser, the Vim syntax file stays in charge.
local config = require("jason.config")

local M = {}

---Make `:TSInstall jason` work (nvim-treesitter `main` branch). Idempotent.
function M.register()
  vim.api.nvim_create_autocmd("User", {
    group = vim.api.nvim_create_augroup("jason.treesitter", { clear = true }),
    pattern = "TSUpdate",
    callback = function()
      local opts = config.options.treesitter
      local install_info = { queries = "queries" }
      if opts.path then
        install_info.path = vim.fs.normalize(opts.path)
      else
        install_info.url = opts.url
        install_info.revision = opts.revision
      end
      require("nvim-treesitter.parsers").jason = { install_info = install_info }
    end,
  })
end

---@param bufnr integer
---@return boolean started
function M.start(bufnr)
  if not config.options.treesitter.highlight then
    return false
  end
  local ok, has_parser = pcall(vim.treesitter.language.add, "jason")
  if not (ok and has_parser) then
    return false
  end
  return (pcall(vim.treesitter.start, bufnr, "jason"))
end

---@param bufnr integer
---@return boolean
function M.active(bufnr)
  return vim.treesitter.highlighter.active[bufnr] ~= nil
end

return M
