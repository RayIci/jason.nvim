---Syntax checking through the parser bundled in the Jason jar.
---
---tools/JasonLint.java is compiled once into the cache directory (in the
---background); until that finishes, Java runs the source file directly,
---which works but starts about five times slower.
local config = require("jason.config")

local M = {}

M.script = vim.fs.joinpath(require("jason.paths").root, "tools", "JasonLint.java")

---The Jason jar: the `jar` option, or the `jason` launcher in PATH, which is
---a jar with a shell stub in front of it.
---@return string|nil
function M.jar()
  if config.options.jar then
    return vim.fs.normalize(config.options.jar)
  end
  local exe = vim.fn.exepath(config.options.cmd)
  return exe ~= "" and vim.uv.fs_realpath(exe) or nil
end

---@param path string
---@return string
local function stamp(path)
  local stat = vim.uv.fs_stat(path)
  return stat and ("%d.%d"):format(stat.mtime.sec, stat.size) or "0"
end

---Cache directory for the compiled checker, keyed on the jar and the source.
---@param jar string
---@return string
local function class_dir(jar)
  local key = vim.fn.sha256(table.concat({ jar, stamp(jar), stamp(M.script) }, "|")):sub(1, 12)
  return vim.fs.joinpath(vim.fn.stdpath("cache") --[[@as string]], "jason.nvim", "lint-" .. key)
end

local compiling = false

---@param jar string
---@param dir string
local function compile(jar, dir)
  if compiling or vim.fn.executable("javac") == 0 then
    return
  end
  compiling = true
  local tmp = dir .. ".tmp"
  vim.fn.delete(tmp, "rf")
  vim.system({ "javac", "-nowarn", "-cp", jar, "-d", tmp, M.script }, {}, function(res)
    compiling = false
    if res.code == 0 then
      vim.uv.fs_rename(tmp, dir)
    else
      vim.schedule(function()
        vim.notify("jason.nvim: compiling the linter failed:\n" .. (res.stderr or ""), vim.log.levels.WARN)
      end)
    end
  end)
end

---Java arguments that run the checker (the compiled class when available).
---@return string[]|nil args, string|nil err
function M.java_args()
  local jar = M.jar()
  if not jar then
    return nil, ("`%s` not found in PATH; set the `jar` option"):format(config.options.cmd)
  end
  local dir = class_dir(jar)
  local fast = { "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1" }
  if vim.uv.fs_stat(vim.fs.joinpath(dir, "JasonLint.class")) then
    local sep = vim.fn.has("win32") == 1 and ";" or ":"
    return vim.list_extend(fast, { "-cp", jar .. sep .. dir, "JasonLint" })
  end
  compile(jar, dir)
  return vim.list_extend(fast, { "-cp", jar, M.script })
end

---nvim-lint linter definition.
---@return table
function M.linter()
  local args, err = M.java_args()
  local parser = require("lint.parser").from_pattern(
    "^.-:(%d+):(%d+): (%a+): (.*)$",
    { "lnum", "col", "severity", "message" },
    { error = vim.diagnostic.severity.ERROR, warning = vim.diagnostic.severity.WARN },
    { source = "jason" }
  )
  if not args then
    -- Report the setup problem as a diagnostic instead of failing the lint run.
    return {
      cmd = "true",
      stdin = false,
      append_fname = false,
      parser = function()
        return { { lnum = 0, col = 0, severity = vim.diagnostic.severity.WARN, source = "jason", message = err } }
      end,
    }
  end
  return {
    cmd = "java",
    stdin = true,
    append_fname = false,
    args = vim.list_extend(args, {
      "--stdin",
      function()
        return vim.api.nvim_buf_get_name(0)
      end,
    }),
    stream = "stdout",
    ignore_exitcode = true,
    cwd = vim.fs.dirname(vim.api.nvim_buf_get_name(0)),
    parser = parser,
  }
end

return M
