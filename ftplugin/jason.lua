-- Jason / AgentSpeak (.asl) buffer settings.
if vim.b.did_ftplugin then
  return
end
vim.b.did_ftplugin = true

require("jason.ftplugin").apply()
require("jason.treesitter").start(0)
