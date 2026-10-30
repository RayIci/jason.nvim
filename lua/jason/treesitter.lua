---tree-sitter integration: registers tree-sitter-jason with nvim-treesitter
---and starts tree-sitter highlighting in jason buffers when the parser is
---installed. Without a parser, the Vim syntax file stays in charge.
local config = require("jason.config")

local M = {}

---Make `:TSInstall jason` work (nvim-treesitter `main` branch). The grammar
---lives in tree-sitter-jason/ inside this plugin, so it is compiled from the
---plugin's own directory and always matches the plugin version. Idempotent.
function M.register()
  vim.api.nvim_create_autocmd("User", {
    group = vim.api.nvim_create_augroup("jason.treesitter", { clear = true }),
    pattern = "TSUpdate",
    callback = function()
      local path = config.options.treesitter.path
      require("nvim-treesitter.parsers").jason = {
        install_info = {
          path = path and vim.fs.normalize(path) or require("jason.paths").root,
          location = "tree-sitter-jason",
          queries = "tree-sitter-jason/queries",
        },
      }
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
