---@class jason.RunSpec
---@field name string short task name, e.g. "jason run demo.mas2j"
---@field cmd string[] command and arguments
---@field cwd string working directory

---@class jason.Config
---@field cmd string Jason CLI executable
---@field jar? string Jason jar used by the linter (default: the `cmd` launcher)
---@field run_args string[] extra arguments for `jason <file>.mas2j`
---@field mind_url string Mind Inspector URL opened by `:Jason mind`
---@field runner "terminal"|fun(spec: jason.RunSpec) how commands are executed
---@field terminal { position: string, size: integer } split used by the "terminal" runner
---@field treesitter jason.TreesitterConfig

---@class jason.TreesitterConfig
---@field highlight boolean start tree-sitter highlighting when the parser is installed
---@field path? string jason.nvim checkout whose tree-sitter-jason/ :TSInstall
---  compiles (default: this plugin's own directory)

local M = {}

---@type jason.Config
M.defaults = {
  cmd = "jason",
  jar = nil,
  run_args = {},
  mind_url = "http://127.0.0.1:3272",
  runner = "terminal",
  terminal = { position = "botright", size = 15 },
  treesitter = {
    highlight = true,
    path = nil,
  },
}

---@type jason.Config
M.options = vim.deepcopy(M.defaults)

---@param opts? table
function M.set(opts)
  M.options = vim.tbl_deep_extend("force", vim.deepcopy(M.defaults), vim.g.jason or {}, opts or {})
end

M.set()

return M
