if vim.g.loaded_jason then
  return
end
vim.g.loaded_jason = true

---@class jason.Subcommand
---@field impl fun(args: string[])
---@field complete? fun(arglead: string): string[]
---@field nargs? "?"|"1"

---@type table<string, jason.Subcommand>
local subcommands = {
  run = {
    nargs = "?",
    impl = function(args)
      require("jason.run").run(args[1])
    end,
    complete = function(arglead)
      return vim.fn.getcompletion(arglead .. "*.mas2j", "file")
    end,
  },
  compile = {
    impl = function()
      require("jason.run").compile()
    end,
  },
  stop = {
    impl = function()
      require("jason.run").stop()
    end,
  },
  mind = {
    impl = function()
      require("jason.run").mind()
    end,
  },
  new = {
    nargs = "1",
    impl = function(args)
      require("jason.run").new(args[1])
    end,
  },
  ["add-agent"] = {
    nargs = "1",
    impl = function(args)
      require("jason.run").add_agent(args[1])
    end,
  },
}

vim.api.nvim_create_user_command("Jason", function(opts)
  local name, args = opts.fargs[1], vim.list_slice(opts.fargs, 2)
  local sub = subcommands[name]
  if not sub then
    vim.notify("Jason: unknown subcommand " .. tostring(name), vim.log.levels.ERROR)
    return
  end
  if sub.nargs == "1" and #args ~= 1 then
    vim.notify(("Jason %s: expected one argument"):format(name), vim.log.levels.ERROR)
    return
  end
  sub.impl(args)
end, {
  nargs = "+",
  desc = "Jason (AgentSpeak) commands",
  complete = function(arglead, cmdline)
    local name, rest = cmdline:match("^%S+%s+(%S+)%s+(.*)$")
    if name and subcommands[name] and subcommands[name].complete then
      return subcommands[name].complete(rest)
    end
    if cmdline:match("^%S+%s+%S*$") then
      return vim.tbl_filter(function(key)
        return key:find(arglead, 1, true) == 1
      end, vim.tbl_keys(subcommands))
    end
    return {}
  end,
})

-- <Plug> mappings for users who want their own keys.
local plugs = {
  ["(jason-run)"] = "run",
  ["(jason-compile)"] = "compile",
  ["(jason-stop)"] = "stop",
  ["(jason-mind)"] = "mind",
}
for plug, sub in pairs(plugs) do
  vim.keymap.set("n", "<Plug>" .. plug, function()
    subcommands[sub].impl({})
  end, { desc = "Jason: " .. sub })
end
