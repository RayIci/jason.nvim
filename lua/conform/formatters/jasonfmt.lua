-- conform.nvim finds this as the `jasonfmt` formatter:
--   require("conform").formatters_by_ft = { jason = { "jasonfmt" }, mas2j = { "jasonfmt" } }
---@type conform.FileLuaFormatterConfig
return {
  meta = {
    url = "https://github.com/RayIci/jason.nvim",
    description = "Whitespace and indentation formatter for Jason (AgentSpeak) and mas2j files.",
  },
  format = function(_, ctx, lines, callback)
    local ft = vim.bo[ctx.buf].filetype == "mas2j" and "mas2j" or "jason"
    local ok, result = pcall(require("jason.format").format, lines, ft, ctx.shiftwidth)
    if ok then
      callback(nil, result)
    else
      callback(tostring(result))
    end
  end,
}
