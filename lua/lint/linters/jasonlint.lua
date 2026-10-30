-- nvim-lint finds this as the `jasonlint` linter:
--   require("lint").linters_by_ft = { jason = { "jasonlint" }, mas2j = { "jasonlint" } }
return function()
  return require("jason.lint").linter()
end
