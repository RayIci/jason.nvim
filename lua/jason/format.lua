---Whitespace-only formatter for Jason agent programs and project files.
---
---Outside strings, quoted atoms and comments it:
---  - puts single spaces around `<-`, `:-`, `<:`, `&` and the context `:`
---    (`|&|` and `|||` are left as they are);
---  - writes `,` and `;` with no space before and one after;
---  - drops trailing whitespace and collapses runs of blank lines;
---then re-indents with the plugin's indent rules. It never adds, removes
---or reorders tokens.
local M = {}

---Split a line into code and non-code segments, carrying block-comment
---state across lines.
---@param line string
---@param in_comment boolean
---@return { code: boolean, text: string }[] segments, boolean in_comment
local function segments(line, in_comment)
  local out = {}
  local i, n = 1, #line
  local start = 1
  local function push(code, j)
    if j >= start then
      out[#out + 1] = { code = code, text = line:sub(start, j) }
    end
    start = j + 1
  end
  while i <= n do
    if in_comment then
      local e = line:find("*/", i, true)
      if not e then
        push(false, n)
        return out, true
      end
      push(false, e + 1)
      in_comment = false
      i = e + 2
    else
      local c, nxt = line:sub(i, i), line:sub(i + 1, i + 1)
      if c == "/" and nxt == "/" then
        push(true, i - 1)
        push(false, n)
        return out, false
      elseif c == "/" and nxt == "*" then
        push(true, i - 1)
        in_comment = true
        i = i + 2
      elseif c == '"' or c == "'" then
        push(true, i - 1)
        local j = i + 1
        while j <= n do
          local d = line:sub(j, j)
          if d == "\\" and c == '"' then
            j = j + 2
          elseif d == c then
            break
          else
            j = j + 1
          end
        end
        push(false, math.min(j, n))
        i = j + 1
      else
        i = i + 1
      end
    end
  end
  push(true, n)
  return out, in_comment
end

---Space a single ':' (the plan context separator), leaving `::`, `:-`
---and `<:` alone.
---@param s string
---@return string
local function space_context_colon(s)
  local out = {}
  local i = 1
  while i <= #s do
    local c = s:sub(i, i)
    if c == ":" then
      local prev, nxt = s:sub(i - 1, i - 1), s:sub(i + 1, i + 1)
      if prev ~= ":" and prev ~= "<" and nxt ~= ":" and nxt ~= "-" then
        -- drop spaces already emitted before the colon
        while #out > 0 and out[#out]:match("^%s$") do
          out[#out] = nil
        end
        out[#out + 1] = " : "
        i = i + 1
        while s:sub(i, i):match("^%s$") do
          i = i + 1
        end
      else
        out[#out + 1] = c
        i = i + 1
      end
    else
      out[#out + 1] = c
      i = i + 1
    end
  end
  return table.concat(out)
end

---@param s string code segment
---@return string
local function space_jason(s)
  -- `|&|` (parallel and) must not be split by the `&` rule.
  s = s:gsub("|&|", "\0")
  s = s:gsub("%s*<%-%s*", " <- ")
    :gsub("%s*:%-%s*", " :- ")
    :gsub("%s*<:%s*", " <: ")
    :gsub("%s*&%s*", " & ")
    :gsub("%s*,%s*", ", ")
    :gsub("%s*;%s*", "; ")
    :gsub("%z", "|&|")
  return space_context_colon(s)
end

---@param s string code segment
---@return string
local function space_mas2j(s)
  return (s:gsub("%s*;%s*", "; "):gsub("%s*,%s*", ", "))
end

---Normalise spacing, trailing whitespace and blank lines.
---@param lines string[]
---@param ft "jason"|"mas2j"
---@return string[]
function M.space(lines, ft)
  local space = ft == "mas2j" and space_mas2j or space_jason
  local out = {}
  local in_comment = false
  local blank = 0
  for _, line in ipairs(lines) do
    local starts_in_comment = in_comment
    local segs
    segs, in_comment = segments(line, in_comment)
    local parts = {}
    for k, seg in ipairs(segs) do
      if seg.code then
        local text = space(seg.text)
        -- Keep the original gap before a trailing comment (aligned comments).
        local nxt = segs[k + 1]
        if nxt and not nxt.code and nxt.text:match("^/[/*]") then
          text = text:gsub("%s+$", "") .. seg.text:match("%s*$")
        end
        -- keep the original indentation; the indent pass replaces it
        if k == 1 then
          text = line:match("^%s*") .. text:gsub("^%s+", "")
        end
        parts[#parts + 1] = text
      else
        parts[#parts + 1] = seg.text
      end
    end
    local result = table.concat(parts)
    if not starts_in_comment then
      result = result:gsub("%s+$", "")
    end
    if result:match("^%s*$") then
      blank = blank + 1
      if blank == 1 and #out > 0 then
        out[#out + 1] = ""
      end
    else
      blank = 0
      out[#out + 1] = result
    end
  end
  while #out > 0 and out[#out] == "" do
    out[#out] = nil
  end
  return out
end

---Re-indent lines with the plugin's indentexpr in a scratch buffer.
---@param lines string[]
---@param ft "jason"|"mas2j"
---@param shiftwidth integer
---@return string[]
function M.indent(lines, ft, shiftwidth)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  local ok, result = pcall(vim.api.nvim_buf_call, buf, function()
    -- Syntax is needed: the indent rules skip brackets in strings/comments.
    vim.bo.syntax = ft
    vim.bo.expandtab = true
    vim.bo.shiftwidth = shiftwidth
    vim.bo.indentexpr = ft == "mas2j" and "v:lua.require'jason.indent'.get_mas2j(v:lnum)"
      or "v:lua.require'jason.indent'.get(v:lnum)"
    vim.cmd("silent keepjumps normal! gg=G")
    return vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  end)
  vim.api.nvim_buf_delete(buf, { force = true })
  if not ok then
    error(result)
  end
  return result
end

---@param lines string[]
---@param ft "jason"|"mas2j"
---@param shiftwidth? integer
---@return string[]
function M.format(lines, ft, shiftwidth)
  return M.indent(M.space(lines, ft), ft, shiftwidth or 4)
end

---Format a buffer in place, keeping the cursor and undo history sane.
---@param bufnr? integer
function M.buffer(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  local ft = vim.bo[bufnr].filetype
  if ft ~= "jason" and ft ~= "mas2j" then
    vim.notify("jason.nvim: not a jason or mas2j buffer", vim.log.levels.WARN)
    return
  end
  local old = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  local new = M.format(old, ft, vim.fn.shiftwidth())
  if not vim.deep_equal(old, new) then
    local view = vim.fn.winsaveview()
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, new)
    vim.fn.winrestview(view)
  end
end

return M
