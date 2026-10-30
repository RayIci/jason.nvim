-- Headless checks: nvim --clean --headless -l tests/run.lua
local root = vim.fs.dirname(vim.fs.dirname(vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p")))
vim.opt.rtp:prepend(root)
vim.cmd("filetype plugin indent on | syntax on")
vim.cmd("runtime! ftdetect/*.lua plugin/*.lua")

local failures = 0
local function check(ok, msg)
  if not ok then
    failures = failures + 1
    io.stdout:write("FAIL " .. msg .. "\n")
  end
end

---@param needle string text to find (first occurrence)
---@param group string expected syntax group at its first char
local function syn(needle, group)
  local pos = vim.fn.searchpos(vim.fn.escape(needle, [[\.*$^~[]/]]), "cnw")
  if pos[1] == 0 then
    return check(false, "not found: " .. needle)
  end
  local got = vim.fn.synIDattr(vim.fn.synID(pos[1], pos[2], 1), "name")
  check(got == group, ("%-28s want %-20s got %s"):format(needle, group, got))
end

---@param file string
---@return boolean ok
local function reindent_is_stable(file)
  vim.cmd.edit(root .. "/tests/fixtures/" .. file)
  local before = vim.api.nvim_buf_get_lines(0, 0, -1, false)
  vim.cmd("silent normal! gg=G")
  local after = vim.api.nvim_buf_get_lines(0, 0, -1, false)
  for i = 1, #before do
    check(before[i] == after[i], ("%s:%d indent\n  want |%s|\n  got  |%s|"):format(file, i, before[i], after[i]))
  end
  vim.cmd("edit!")
end

-- Filetype detection and options
vim.cmd.edit(root .. "/tests/fixtures/sample.asl")
check(vim.bo.filetype == "jason", "asl filetype: " .. vim.bo.filetype)
check(vim.bo.commentstring == "// %s", "commentstring")
check(vim.bo.shiftwidth == 4, "shiftwidth")

for _, c in ipairs({
  { "// Agent", "jasonComment" },
  { "/* Initial", "jasonComment" },
  { "count(0)", "jasonFunctor" },
  { "~raining", "jasonNegation" },
  { ":-", "jasonArrow" },
  { "N > 3", "jasonVariable" },
  { "include", "jasonDirective" },
  { "!start.", "jasonGoal" },
  { "@greet", "jasonLabel" },
  { "atomic", "jasonAnnotation" },
  { "+!start", "jasonTrigger" },
  { "<- .print", "jasonArrow" },
  { ".print(\"hello", "jasonInternalAction" },
  { "\"hello", "jasonString" },
  { "+greeted", "jasonBeliefUpdate" },
  { "-+count", "jasonBeliefUpdate" },
  { "!!loop", "jasonGoal" },
  { "_, X", "jasonAnonVar" },
  { "not busy", "jasonOperator" },
  { "while", "jasonRepeat" },
  { "if (", "jasonConditional" },
  { "mod", "jasonOperator" },
  { "else", "jasonConditional" },
  { "?count", "jasonGoal" },
  { "my.lib.action", "jasonFunctor" },
  { "'quoted", "jasonQuotedAtom" },
  { "3.14", "jasonNumber" },
  { "source", "jasonAnnotation" },
  { "tell,", "jasonPerformative" },
  { "-!loop", "jasonTrigger" },
}) do
  syn(c[1], c[2])
end
-- the plan-closing dot
vim.fn.cursor(1, 1)
local l = vim.fn.search([[\.print("hello world\.");]], "nw")
local endline = vim.fn.getline(l + 3)
check(vim.fn.synIDattr(vim.fn.synID(l + 3, #endline, 1), "name") == "jasonEnd", "plan end dot")

reindent_is_stable("sample.asl")

vim.cmd.edit(root .. "/tests/fixtures/sample.mas2j")
check(vim.bo.filetype == "mas2j", "mas2j filetype: " .. vim.bo.filetype)
for _, c in ipairs({
  { "MAS", "mas2jKeyword" },
  { "environment", "mas2jSection" },
  { "example.Env", "mas2jClass" },
  { "agentArchClass", "mas2jOption" },
  { "verbose", "mas2jOption" },
  { "#3", "mas2jCount" },
  { "\"src", "mas2jString" },
  { "/* demo", "mas2jComment" },
}) do
  syn(c[1], c[2])
end
reindent_is_stable("sample.mas2j")

-- Command
check(vim.fn.exists(":Jason") == 2, ":Jason command")
local comp = vim.fn.getcompletion("Jason ", "cmdline")
check(vim.list_contains(comp, "run") and vim.list_contains(comp, "add-agent"), "subcommand completion")

-- :Jason run resolves the nearest .mas2j and hands the spec to the runner
local spec
require("jason").setup({ runner = function(s) spec = s end, run_args = { "-v" } })
vim.cmd.edit(root .. "/tests/fixtures/sample.asl")
vim.cmd("Jason run")
check(spec and spec.cwd == root .. "/tests/fixtures", "run cwd: " .. vim.inspect(spec))
check(spec and vim.deep_equal(spec.cmd, { "jason", "sample.mas2j", "-v" }), "run cmd: " .. vim.inspect(spec and spec.cmd))

-- :Jason new without a name asks for one
local asked
local input = vim.ui.input
vim.ui.input = function(opts, cb)
  asked = opts.prompt
  cb("my_app")
end
spec = nil
vim.cmd("Jason new")
vim.ui.input = input
check(asked == "New Jason app name: ", "new prompts for a name: " .. tostring(asked))
check(spec and vim.deep_equal(spec.cmd, { "jason", "app", "create", "my_app" }), "new cmd: " .. vim.inspect(spec and spec.cmd))

-- Formatter: expected output, idempotency, and fixtures already formatted
local format = require("jason.format")
local fixtures = root .. "/tests/fixtures/"
local got = format.format(vim.fn.readfile(fixtures .. "messy.asl"), "jason")
local want = vim.fn.readfile(fixtures .. "messy.formatted.asl")
for i = 1, math.max(#got, #want) do
  check(got[i] == want[i], ("messy.asl:%d format\n  want |%s|\n  got  |%s|"):format(i, want[i], got[i]))
end
check(vim.deep_equal(format.format(want, "jason"), want), "format is idempotent")
for _, f in ipairs({ "sample.asl", "sample.mas2j" }) do
  local lines = vim.fn.readfile(fixtures .. f)
  check(vim.deep_equal(format.format(lines, f:match("mas2j$") or "jason"), lines), f .. " is already formatted")
end
vim.cmd.edit(fixtures .. "messy.asl")
vim.cmd("Jason format")
check(vim.deep_equal(vim.api.nvim_buf_get_lines(0, 0, -1, false), want), ":Jason format")
vim.cmd("edit!")

io.stdout:write(failures == 0 and "all checks passed\n" or (failures .. " failure(s)\n"))
os.exit(failures == 0 and 0 or 1)
