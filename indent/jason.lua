-- Jason / AgentSpeak (.asl) indentation.
if vim.b.did_indent then
  return
end
vim.b.did_indent = true

vim.bo.indentexpr = "v:lua.require'jason.indent'.get(v:lnum)"
vim.bo.indentkeys = "0{,0},0),0],:,0=<-,!^F,o,O"
vim.bo.autoindent = true

local undo = "setlocal indentexpr< indentkeys< autoindent<"
vim.b.undo_indent = undo
