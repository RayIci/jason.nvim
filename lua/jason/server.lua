---Build the bundled language server (server/) with npm.
local paths = require("jason.paths")

local M = {}

---@return boolean
function M.built()
  return vim.uv.fs_stat(paths.server_main) ~= nil
end

---Run `npm ci` and `npm run build` in server/. Synchronous when `wait` is
---set (for plugin-manager build hooks), else in the background.
---@param opts? { wait?: boolean }
function M.build(opts)
  opts = opts or {}
  if vim.fn.executable("npm") == 0 then
    vim.notify("jason.nvim: npm is needed to build the language server", vim.log.levels.ERROR)
    return
  end
  local function step(cmd, next)
    local function done(res)
      if res.code ~= 0 then
        vim.schedule(function()
          vim.notify(("jason.nvim: `%s` failed:\n%s"):format(table.concat(cmd, " "), res.stderr or ""), vim.log.levels.ERROR)
        end)
      elseif next then
        next()
      else
        vim.schedule(function()
          vim.notify("jason.nvim: language server built; restart Neovim or :lsp restart jason_ls")
        end)
      end
    end
    if opts.wait then
      done(vim.system(cmd, { cwd = paths.server }):wait())
    else
      vim.system(cmd, { cwd = paths.server }, done)
    end
  end
  if not opts.wait then
    vim.notify("jason.nvim: building the language server…")
  end
  step({ "npm", "ci", "--no-audit", "--no-fund" }, function()
    step({ "npm", "run", "build" })
  end)
end

return M
