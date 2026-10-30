---Locations inside the plugin checkout.
local M = {}

---The plugin's root directory.
M.root = vim.fs.dirname(vim.fs.dirname(vim.fs.dirname(debug.getinfo(1, "S").source:sub(2))))

---The bundled language server (server/), and its entry point once built.
M.server = vim.fs.joinpath(M.root, "server")
M.server_main = vim.fs.joinpath(M.server, "dist", "server.js")

return M
