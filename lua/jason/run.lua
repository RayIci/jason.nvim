---Run Jason CLI commands through the configured runner.
local config = require("jason.config")
local project = require("jason.project")

local M = {}

---@type integer|nil job of the last command started by the terminal runner
local last_job

---@param spec jason.RunSpec
local function terminal(spec)
  local term = config.options.terminal
  vim.cmd(("%s %dnew"):format(term.position, term.size))
  last_job = vim.fn.jobstart(spec.cmd, { term = true, cwd = spec.cwd })
  vim.bo.bufhidden = "wipe"
  pcall(vim.api.nvim_buf_set_name, 0, ("jason://%s"):format(spec.name))
  vim.cmd.startinsert()
end

---@param args string[] arguments for the Jason CLI
---@param cwd string
function M.exec(args, cwd)
  local opts = config.options
  if vim.fn.executable(opts.cmd) == 0 then
    vim.notify(("jason.nvim: `%s` not found in PATH"):format(opts.cmd), vim.log.levels.ERROR)
    return
  end
  local spec = {
    name = table.concat(vim.list_extend({ "jason" }, args), " "),
    cmd = vim.list_extend({ opts.cmd }, args),
    cwd = cwd,
  }
  if type(opts.runner) == "function" then
    opts.runner(spec)
  else
    terminal(spec)
  end
end

---@param fn fun(root: string, file: string)
local function with_project(fn)
  project.mas2j(0, function(file)
    if not file then
      vim.notify("jason.nvim: no .mas2j project file found", vim.log.levels.WARN)
      return
    end
    fn(vim.fs.dirname(file), file)
  end)
end

---Run a multi-agent system (the given .mas2j or the nearest one).
---@param file? string
function M.run(file)
  local function start(root, mas2j)
    local args = vim.list_extend({ vim.fs.basename(mas2j) }, vim.deepcopy(config.options.run_args))
    M.exec(args, root)
  end
  if file and file ~= "" then
    local path = vim.fn.fnamemodify(file, ":p")
    return start(vim.fs.dirname(path), path)
  end
  with_project(start)
end

function M.compile()
  with_project(function(root)
    M.exec({ "app", "compile" }, root)
  end)
end

---@param name string
function M.add_agent(name)
  with_project(function(root)
    M.exec({ "app", "add-agent", name }, root)
  end)
end

---Create an application in the current working directory.
---@param name string
function M.new(name)
  M.exec({ "app", "create", name }, vim.fn.getcwd())
end

---Stop the last system started by the terminal runner.
function M.stop()
  if last_job and vim.fn.jobwait({ last_job }, 0)[1] == -1 then
    vim.fn.jobstop(last_job)
    last_job = nil
    return
  end
  vim.notify("jason.nvim: no running system started from this session", vim.log.levels.INFO)
end

function M.mind()
  vim.ui.open(config.options.mind_url)
end

return M
