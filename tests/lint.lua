-- Linter checks against nvim-lint: nvim --clean --headless -l tests/lint.lua
-- Needs nvim-lint (NVIM_LINT=<path>, or a vim.pack / lazy.nvim install) and
-- the jason CLI; skipped otherwise.
local root = vim.fs.dirname(vim.fs.dirname(vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p")))
local data = vim.fn.stdpath("data")
local nvim_lint = os.getenv("NVIM_LINT")
  or vim.iter({ data .. "/site/pack/core/opt/nvim-lint", data .. "/lazy/nvim-lint" }):find(function(p)
    return vim.uv.fs_stat(p) ~= nil
  end)
if not nvim_lint or vim.fn.executable("jason") == 0 then
  io.stdout:write("skipped: needs nvim-lint and the jason CLI\n")
  os.exit(0)
end
vim.opt.rtp:prepend(nvim_lint)
vim.opt.rtp:prepend(root)
vim.cmd("filetype plugin indent on | syntax on | runtime! ftdetect/*.lua plugin/*.lua")

-- Isolated cache so the first run exercises the uncompiled path.
vim.env.XDG_CACHE_HOME = vim.fn.tempname()
local lint = require("lint")
lint.linters_by_ft = { jason = { "jasonlint" }, mas2j = { "jasonlint" } }

local failures = 0
local function check(ok, msg)
  if not ok then
    failures = failures + 1
    io.stdout:write("FAIL " .. msg .. "\n")
  end
end

---@param lines string[]
---@param ft string
---@return vim.Diagnostic[]
local function lint_lines(lines, ft)
  vim.cmd("enew!")
  vim.api.nvim_buf_set_name(0, vim.fn.tempname() .. "." .. (ft == "jason" and "asl" or "mas2j"))
  vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
  vim.bo.filetype = ft
  lint.try_lint()
  vim.wait(20000, function()
    return #lint.get_running() == 0
  end, 50)
  return vim.diagnostic.get(0)
end

local d = lint_lines(vim.fn.readfile(root .. "/tests/fixtures/sample.asl"), "jason")
check(#d == 0, "sample.asl clean: " .. vim.inspect(d))

d = lint_lines({ "+!start : true", '    <- .print("hi")', "       !next." }, "jason")
check(#d == 1 and d[1].lnum == 2 and d[1].col == 7 and d[1].severity == vim.diagnostic.severity.ERROR,
  "missing ';' reported at 3:8: " .. vim.inspect(d))

-- By now the background javac has had time to finish: the compiled class is used.
vim.wait(20000, function()
  return #vim.fn.glob(vim.fn.stdpath("cache") .. "/jason.nvim/lint-*/JasonLint.class", false, true) > 0
end, 100)
local args = require("jason.lint").java_args()
check(args and args[#args] == "JasonLint", "compiled class in use: " .. vim.inspect(args))

d = lint_lines({ "MAS x {", "  agents: bob", "}" }, "mas2j")
check(#d == 1 and d[1].lnum == 2, "mas2j error on line 3: " .. vim.inspect(d))

d = lint_lines({ "{ begin ld }", "+!g <- act.", "{ end }" }, "jason")
check(#d == 1 and d[1].severity == vim.diagnostic.severity.WARN, "user directive warning: " .. vim.inspect(d))

io.stdout:write(failures == 0 and "all lint checks passed\n" or (failures .. " failure(s)\n"))
os.exit(failures == 0 and 0 or 1)
