-- tree-sitter checks: nvim --clean --headless -l tests/treesitter.lua
-- Builds the parser from TREE_SITTER_JASON (default: ../tree-sitter-jason)
-- with cc; skipped when the checkout or cc is missing.
local root = vim.fs.dirname(vim.fs.dirname(vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p")))
local grammar = vim.fs.normalize(os.getenv("TREE_SITTER_JASON") or (vim.fs.dirname(root) .. "/tree-sitter-jason"))
if not vim.uv.fs_stat(grammar .. "/src/parser.c") or vim.fn.executable("cc") == 0 then
  io.stdout:write("skipped: needs " .. grammar .. "/src/parser.c and cc\n")
  os.exit(0)
end

local rt = vim.fn.tempname()
vim.fn.mkdir(rt .. "/parser", "p")
vim.fn.mkdir(rt .. "/queries", "p")
local build = vim.system({ "cc", "-shared", "-fPIC", "-O2", "-I", grammar .. "/src", grammar .. "/src/parser.c", "-o", rt .. "/parser/jason.so" }):wait()
assert(build.code == 0, build.stderr)
vim.uv.fs_symlink(grammar .. "/queries", rt .. "/queries/jason")

vim.opt.rtp:prepend(rt)
vim.opt.rtp:prepend(root)
vim.cmd("filetype plugin indent on | syntax on | runtime! ftdetect/*.lua plugin/*.lua")

local failures = 0
local function check(ok, msg)
  if not ok then
    failures = failures + 1
    io.stdout:write("FAIL " .. msg .. "\n")
  end
end

vim.cmd.edit(root .. "/tests/fixtures/sample.asl")
check(vim.treesitter.highlighter.active[vim.api.nvim_get_current_buf()] ~= nil, "ftplugin starts tree-sitter")
check(vim.bo.syntax == "", "regex syntax off: " .. vim.bo.syntax)
check(vim.bo.indentexpr:find("jason.indent") ~= nil, "jason indentexpr kept: " .. vim.bo.indentexpr)

vim.treesitter.get_parser(0):parse(true)
local function captures(needle)
  local pos = vim.fn.searchpos(vim.fn.escape(needle, [[\.*$^~[]/]]), "cnw")
  return vim.tbl_map(function(c)
    return c.capture
  end, vim.treesitter.get_captures_at_pos(0, pos[1] - 1, pos[2] - 1))
end
for _, c in ipairs({
  { "+!start", "keyword" },
  { ".print", "function.builtin" },
  { "my.lib.action", "function.call" },
  { "-+count", "keyword" },
  { "while", "keyword.repeat" },
  { "atomic", "attribute" },
  { "include", "keyword.directive" },
  { "mod", "keyword.operator" },
}) do
  local caps = captures(c[1])
  check(caps[#caps] == c[2], ("%-14s want %s got %s"):format(c[1], c[2], table.concat(caps, " ")))
end

-- Indentation with tree-sitter active: stable on the fixture, and brackets
-- inside strings and comments are ignored.
local before = vim.api.nvim_buf_get_lines(0, 0, -1, false)
vim.cmd("silent normal! gg=G")
check(vim.deep_equal(before, vim.api.nvim_buf_get_lines(0, 0, -1, false)), "reindent stable with tree-sitter")
vim.cmd("enew!")
vim.bo.filetype = "jason"
vim.api.nvim_buf_set_lines(0, 0, -1, false, {
  "+!g",
  '<- .print("{ [ (");  // { not a block',
  "!next.",
  "+b.",
})
vim.cmd("silent normal! gg=G")
local got = vim.api.nvim_buf_get_lines(0, 0, -1, false)
check(got[3] == "       !next." and got[4] == "+b.", "string/comment brackets ignored: " .. vim.inspect(got))

-- :TSInstall registration
local data = vim.fn.stdpath("data")
local nvim_ts = vim.iter({ data .. "/site/pack/core/opt/nvim-treesitter", data .. "/lazy/nvim-treesitter" }):find(function(p)
  return vim.uv.fs_stat(p) ~= nil
end)
if nvim_ts then
  vim.opt.rtp:prepend(nvim_ts)
  require("jason").setup({ treesitter = { path = grammar } })
  vim.api.nvim_exec_autocmds("User", { pattern = "TSUpdate" })
  local info = require("nvim-treesitter.parsers").jason
  check(info and info.install_info.path == grammar and info.install_info.queries == "queries",
    "TSUpdate registers the parser: " .. vim.inspect(info))
end

io.stdout:write(failures == 0 and "all tree-sitter checks passed\n" or (failures .. " failure(s)\n"))
os.exit(failures == 0 and 0 or 1)
