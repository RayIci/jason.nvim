-- Jason project file (.mas2j) buffer settings.
if vim.b.did_ftplugin then
  return
end
vim.b.did_ftplugin = true

require("jason.ftplugin").apply()
