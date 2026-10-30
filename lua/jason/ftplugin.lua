---Buffer-local options shared by the jason and mas2j filetypes.
local M = {}

function M.apply()
  local bo = vim.bo

  -- Both grammars only know // line comments and /* */ block comments.
  bo.commentstring = "// %s"
  bo.comments = "s1:/*,mb:*,ex:*/,://"
  bo.formatoptions = bo.formatoptions:gsub("t", "") .. "croql"
  bo.matchpairs = "(:),{:},[:]"
  bo.suffixesadd = ".asl"

  -- Jason's own templates (`jason app create`) use 4-space indents.
  -- Opt out with `vim.g.jason_recommended_style = false`.
  if vim.g.jason_recommended_style ~= false then
    bo.expandtab = true
    bo.shiftwidth = 4
    bo.softtabstop = 4
    bo.tabstop = 4
  end

  local undo = "setlocal commentstring< comments< formatoptions< matchpairs< suffixesadd<"
    .. " expandtab< shiftwidth< softtabstop< tabstop<"
  vim.b.undo_ftplugin = vim.b.undo_ftplugin and (vim.b.undo_ftplugin .. " | " .. undo) or undo
end

return M
