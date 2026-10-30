---jason.nvim: Jason (AgentSpeak) support for Neovim.
---
---Filetype detection, syntax, indent and the `:Jason` command work without
---calling setup(); call it only to change the defaults in jason.config.
local M = {}

---@param opts? jason.Config|table
function M.setup(opts)
  require("jason.config").set(opts)
end

return M
