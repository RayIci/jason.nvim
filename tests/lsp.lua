-- LSP checks: nvim --clean --headless -l tests/lsp.lua
-- Uses JASON_LS (path to dist/server.js; default ../jason-language-server)
-- and node; skipped when either is missing.
local root = vim.fs.dirname(vim.fs.dirname(vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p")))
local server_repo = vim.fs.dirname(root) .. "/jason-language-server"
local server = vim.fs.normalize(os.getenv("JASON_LS") or (server_repo .. "/dist/server.js"))
if not vim.uv.fs_stat(server) or vim.fn.executable("node") == 0 then
  io.stdout:write("skipped: needs " .. server .. " and node\n")
  os.exit(0)
end
vim.opt.rtp:prepend(root)
vim.cmd("filetype plugin indent on | syntax on | runtime! ftdetect/*.lua plugin/*.lua")

local failures = 0
local function check(ok, msg)
  if not ok then
    failures = failures + 1
    io.stdout:write("FAIL " .. msg .. "\n")
  end
end

vim.lsp.config("jason_ls", { cmd = { "node", server, "--stdio" } })
vim.lsp.enable("jason_ls")

local project = server_repo .. "/test/fixtures/project"
vim.cmd.edit(project .. "/src/agt/bob.asl")
local client
vim.wait(10000, function()
  client = vim.lsp.get_clients({ bufnr = 0, name = "jason_ls" })[1]
  return client ~= nil and client.initialized
end, 50)
check(client ~= nil, "jason_ls attaches")
if client then
  check(client.config.root_dir == project, "root is the .mas2j directory: " .. tostring(client.config.root_dir))

  vim.wait(5000, function()
    return #vim.diagnostic.get(0) > 0
  end, 50)
  local diags = vim.diagnostic.get(0)
  check(#diags == 1 and diags[1].message:match("^singleton variable X"), "diagnostics: " .. vim.inspect(diags))

  local res = client:request_sync("textDocument/documentSymbol", { textDocument = vim.lsp.util.make_text_document_params(0) }, 5000, 0)
  local names = vim.tbl_map(function(s)
    return s.name
  end, res and res.result or {})
  check(vim.list_contains(names, "+!start") and vim.list_contains(names, "+!work(Y)"), "document symbols: " .. vim.inspect(names))

  local pos = vim.fn.searchpos("greet", "nw")
  local params = { textDocument = vim.lsp.util.make_text_document_params(0), position = { line = pos[1] - 1, character = pos[2] } }
  local def = client:request_sync("textDocument/definition", params, 5000, 0)
  local loc = def and def.result and def.result[1]
  check(loc and loc.uri:match("common%.asl$"), "definition of !greet: " .. vim.inspect(def))
end

io.stdout:write(failures == 0 and "all lsp checks passed\n" or (failures .. " failure(s)\n"))
os.exit(failures == 0 and 0 or 1)
