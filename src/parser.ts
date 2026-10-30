import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Language, Parser, type Tree } from 'web-tree-sitter';

let parser: Parser | undefined;

/** Load the tree-sitter-jason grammar (WebAssembly) once. */
export async function initParser(wasmPath?: string): Promise<void> {
  if (parser) {
    return;
  }
  await Parser.init();
  const path = wasmPath ?? fileURLToPath(new URL('../grammar/tree-sitter-jason.wasm', import.meta.url));
  const language = await Language.load(await readFile(path));
  parser = new Parser();
  parser.setLanguage(language);
}

/** Parse a document. The caller owns the tree and must delete() it. */
export function parse(text: string): Tree {
  if (!parser) {
    throw new Error('parser not initialised');
  }
  const tree = parser.parse(text);
  if (!tree) {
    throw new Error('tree-sitter returned no tree');
  }
  return tree;
}
