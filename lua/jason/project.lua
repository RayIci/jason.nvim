---Locate Jason projects (directories holding a .mas2j file).
local M = {}

---@param name string
---@return boolean
local function is_mas2j(name)
  return name:match("%.mas2j$") ~= nil
end

---@param start string directory to search upward from
---@return string[] .mas2j files in the nearest directory that has any
local function nearest(start)
  local found = vim.fs.find(is_mas2j, { path = start, upward = true, type = "file", limit = math.huge })
  if #found == 0 then
    return {}
  end
  local dir = vim.fs.dirname(found[1])
  return vim.tbl_filter(function(f)
    return vim.fs.dirname(f) == dir
  end, found)
end

---Resolve the project file for a buffer: the buffer itself when it is a
---.mas2j, else the nearest one above it (or above the cwd). Asks when a
---directory holds several.
---@param bufnr integer
---@param callback fun(file: string|nil)
function M.mas2j(bufnr, callback)
  local name = vim.api.nvim_buf_get_name(bufnr)
  if is_mas2j(name) then
    return callback(name)
  end
  local candidates = name ~= "" and nearest(vim.fs.dirname(name)) or {}
  if #candidates == 0 then
    candidates = nearest(vim.fn.getcwd())
  end
  if #candidates <= 1 then
    return callback(candidates[1])
  end
  table.sort(candidates)
  vim.ui.select(candidates, {
    prompt = "Jason project",
    format_item = function(f)
      return vim.fn.fnamemodify(f, ":~:.")
    end,
  }, callback)
end

---@param bufnr integer
---@param callback fun(root: string|nil)
function M.root(bufnr, callback)
  M.mas2j(bufnr, function(file)
    callback(file and vim.fs.dirname(file))
  end)
end

return M
