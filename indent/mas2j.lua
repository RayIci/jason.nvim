-- Jason project file (.mas2j) indentation: brace based.
if vim.b.did_indent then
  return
end
vim.b.did_indent = true

vim.bo.indentexpr = "v:lua.require'jason.indent'.get_mas2j(v:lnum)"
vim.bo.indentkeys = "0{,0},0],!^F,o,O"
vim.bo.autoindent = true

vim.b.undo_indent = "setlocal indentexpr< indentkeys< autoindent<"
