// End-to-end tests: start the server over stdio and talk LSP to it.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';

const project = fileURLToPath(new URL('./fixtures/project/', import.meta.url));
const server = fileURLToPath(new URL('../dist/server.js', import.meta.url));
const uri = rel => pathToFileURL(project + rel).href;
const bob = uri('src/agt/bob.asl');
const common = uri('src/agt/common.asl');

let proc;
let conn;
const diagnostics = new Map();
const waiters = [];

/** Position of the n-th occurrence of `needle` in a fixture, plus an offset. */
function pos(rel, needle, offset = 0, nth = 1) {
  const lines = readFileSync(project + rel, 'utf8').split('\n');
  let seen = 0;
  for (let line = 0; line < lines.length; line++) {
    let from = 0;
    for (;;) {
      const character = lines[line].indexOf(needle, from);
      if (character < 0) break;
      if (++seen === nth) return { line, character: character + offset };
      from = character + 1;
    }
  }
  throw new Error(`${needle} not found in ${rel}`);
}

function open(docUri, text) {
  conn.sendNotification('textDocument/didOpen', {
    textDocument: { uri: docUri, languageId: 'jason', version: 1, text: text ?? readFileSync(fileURLToPath(docUri), 'utf8') },
  });
}

function diagnosticsFor(docUri) {
  if (diagnostics.has(docUri)) return Promise.resolve(diagnostics.get(docUri));
  return new Promise(resolve => waiters.push({ uri: docUri, resolve }));
}

before(async () => {
  proc = spawn(process.execPath, [server, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
  conn = createMessageConnection(new StreamMessageReader(proc.stdout), new StreamMessageWriter(proc.stdin));
  conn.onNotification('textDocument/publishDiagnostics', p => {
    diagnostics.set(p.uri, p.diagnostics);
    for (const w of waiters.filter(w => w.uri === p.uri)) w.resolve(p.diagnostics);
  });
  conn.listen();
  const init = await conn.sendRequest('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(project).href,
    capabilities: {},
  });
  assert.ok(init.capabilities.definitionProvider);
  conn.sendNotification('initialized', {});
  open(bob);
});

after(() => {
  conn.dispose();
  proc.kill();
});

test('reports singleton variables', async () => {
  const diags = await diagnosticsFor(bob);
  assert.deepEqual(diags.map(d => d.message), ['singleton variable X (use _X or _ if it is intentionally unused)']);
  assert.deepEqual(diags[0].range.start, pos('src/agt/bob.asl', 'X)'));
});

test('reports all syntax errors, not just the first', async () => {
  const broken = uri('src/agt/broken.asl');
  open(broken, '+!a <- .print("x")\n   !b.\n\n+!c <- foo(.\n');
  const diags = await diagnosticsFor(broken);
  const errors = diags.filter(d => d.severity === 1);
  assert.equal(errors.length, 2, JSON.stringify(diags));
  // tree-sitter pinpoints the missing ';' where it belongs
  assert.deepEqual(errors.map(e => [e.range.start.line, e.message]), [[0, "missing ';'"], [3, "syntax error: unexpected '('"]]);
});

test('outlines plans, sub-plans, rules, beliefs and directives', async () => {
  const symbols = await conn.sendRequest('textDocument/documentSymbol', { textDocument: { uri: bob } });
  const names = symbols.map(s => s.name);
  assert.deepEqual(names, ['include("common.asl")', 'count(0)', 'ready', '!start', '+!start', '+!work(Y)', 'namespace(inner, local)']);
  assert.equal(symbols[4].detail, '@start[atomic] : ready');
  assert.deepEqual(symbols[5].children.map(s => s.name), ['+!sub']);
  assert.deepEqual(symbols[6].children.map(s => s.name), ['flag(on)']);
});

test('goes from a goal to the plan in an included file', async () => {
  const defs = await conn.sendRequest('textDocument/definition', { textDocument: { uri: bob }, position: pos('src/agt/bob.asl', 'greet', 1) });
  assert.equal(defs.length, 1);
  assert.equal(defs[0].uri, common);
  assert.equal(defs[0].range.start.line, 1);
});

test('goes from an include to the file', async () => {
  const defs = await conn.sendRequest('textDocument/definition', { textDocument: { uri: bob }, position: pos('src/agt/bob.asl', 'common.asl', 2) });
  assert.equal(defs[0].uri, common);
});

test('goes from a test goal and a query to beliefs and rules', async () => {
  const fromTest = await conn.sendRequest('textDocument/definition', { textDocument: { uri: bob }, position: pos('src/agt/bob.asl', 'count(C)', 1) });
  assert.deepEqual(fromTest.map(d => d.range.start.line), [2]);
  const fromContext = await conn.sendRequest('textDocument/definition', { textDocument: { uri: bob }, position: pos('src/agt/bob.asl', 'ready', 1, 2) });
  assert.deepEqual(fromContext.map(d => d.range.start.line), [3]);
});

test('goes from a user internal action to its Java source', async () => {
  const defs = await conn.sendRequest('textDocument/definition', { textDocument: { uri: bob }, position: pos('src/agt/bob.asl', 'lib.act', 4) });
  assert.equal(defs[0].uri, uri('src/java/lib/act.java'));
});

test('finds references across the workspace', async () => {
  const refs = await conn.sendRequest('textDocument/references', {
    textDocument: { uri: bob },
    position: pos('src/agt/bob.asl', 'count(0)', 1),
    context: { includeDeclaration: true },
  });
  assert.equal(refs.length, 4); // count(0), count(N), ?count(C), -+count(C + 1)
  const hi = await conn.sendRequest('textDocument/references', {
    textDocument: { uri: bob },
    position: pos('src/agt/bob.asl', 'hi)', 0),
    context: { includeDeclaration: true },
  });
  assert.ok(hi.some(r => r.uri === uri('src/agt/alice.asl')), 'tell content links to the +hi plan in alice');
});

test('documents internal actions on hover', async () => {
  const h = await conn.sendRequest('textDocument/hover', { textDocument: { uri: bob }, position: pos('src/agt/bob.asl', '.send', 2) });
  assert.match(h.contents.value, /\.send\(receiver,performative,content/);
  assert.match(h.contents.value, /used to send messages to other agents/i);
});

test('lists the plans for a goal on hover', async () => {
  const h = await conn.sendRequest('textDocument/hover', { textDocument: { uri: bob }, position: pos('src/agt/bob.asl', 'greet', 1) });
  assert.match(h.contents.value, /\*\*Goal\*\* `greet\/1`/);
  assert.match(h.contents.value, /\+!greet\(Name\)` — common\.asl:2/);
});

test('completes internal actions, goals, performatives and variables', async () => {
  const doc = uri('src/agt/scratch.asl');
  const text = '+!t <- .pri\n  ; !gr\n  ; .send(bob, \n  ; X = 1; .print(X\n';
  open(doc, text);
  await diagnosticsFor(doc);
  const at = (line, character) => conn.sendRequest('textDocument/completion', { textDocument: { uri: doc }, position: { line, character } });

  const ia = await at(0, 11);
  const print = ia.find(i => i.label === '.print');
  assert.ok(print, 'offers .print');
  assert.deepEqual(print.textEdit.range, { start: { line: 0, character: 7 }, end: { line: 0, character: 11 } });

  const goals = await at(1, 6);
  const greet = goals.find(i => i.label === 'greet/1');
  assert.ok(greet, 'offers greet/1');
  assert.equal(greet.insertText, 'greet(${1:Name})');

  const perf = await at(2, 15);
  assert.ok(perf.some(i => i.label === 'achieve'));

  const vars = await at(3, 19);
  assert.deepEqual(vars.map(i => i.label), ['X']);
});

test('formats the document', async () => {
  const doc = uri('src/agt/format_me.asl');
  open(doc, '+!g:true<-a;b.\n');
  await diagnosticsFor(doc);
  const edits = await conn.sendRequest('textDocument/formatting', { textDocument: { uri: doc }, options: { tabSize: 4, insertSpaces: true } });
  assert.equal(edits.length, 1);
  assert.equal(edits[0].newText, '+!g : true <- a; b.\n');
  const broken = uri('src/agt/broken.asl');
  const none = await conn.sendRequest('textDocument/formatting', { textDocument: { uri: broken }, options: { tabSize: 4, insertSpaces: true } });
  assert.deepEqual(none, []);
});
