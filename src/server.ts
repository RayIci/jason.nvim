#!/usr/bin/env node
// Jason (AgentSpeak) language server. Run with --stdio.

import {
  createConnection,
  DidChangeWatchedFilesNotification,
  FileChangeType,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeResult,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { completion, definition, documentSymbols, hover, references, workspaceSymbols } from './features.js';
import { initParser } from './parser.js';
import { uriToPath, Workspace } from './workspace.js';

if (process.argv.includes('--version')) {
  console.log('jason-language-server 0.1.0');
  process.exit(0);
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const ws = new Workspace();
let watchFiles = false;
let ready: Promise<void> = Promise.resolve();

function publish(uri: string): void {
  const index = ws.files.get(uri);
  connection.sendDiagnostics({ uri, diagnostics: index?.diagnostics ?? [] });
}

connection.onInitialize(async (params): Promise<InitializeResult> => {
  await initParser();
  const roots = (params.workspaceFolders?.map(f => f.uri) ?? (params.rootUri ? [params.rootUri] : []))
    .filter(u => u.startsWith('file:'))
    .map(uriToPath);
  ready = (async () => {
    for (const root of roots) {
      ws.addRoot(root);
    }
  })();
  watchFiles = params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      hoverProvider: true,
      completionProvider: { triggerCharacters: ['.', '!', '?', '+', '-'] },
    },
    serverInfo: { name: 'jason-language-server', version: '0.1.0' },
  };
});

connection.onInitialized(() => {
  if (watchFiles) {
    void connection.client.register(DidChangeWatchedFilesNotification.type, { watchers: [{ globPattern: '**/*.{asl,mas2j}' }] });
  }
});

documents.onDidChangeContent(async change => {
  await ready;
  const { uri } = change.document;
  if (uri.startsWith('file:') && ws.roots.size === 0) {
    // No workspace folder: index the project around the first file.
    ws.addRoot(ws.projectRootOf(uriToPath(uri)));
  }
  ws.open(uri, change.document.getText());
  publish(uri);
});

documents.onDidClose(change => {
  ws.close(change.document.uri);
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
});

connection.onDidChangeWatchedFiles(params => {
  for (const change of params.changes) {
    if (change.uri.endsWith('.asl')) {
      if (change.type === FileChangeType.Deleted) {
        ws.files.delete(change.uri);
      } else {
        ws.refresh(change.uri);
      }
    }
  }
});

connection.onDocumentSymbol(async p => {
  await ready;
  return documentSymbols(ws, p.textDocument.uri);
});
connection.onWorkspaceSymbol(async p => {
  await ready;
  return workspaceSymbols(ws, p.query);
});
connection.onDefinition(async p => {
  await ready;
  return definition(ws, p.textDocument.uri, p.position);
});
connection.onReferences(async p => {
  await ready;
  return references(ws, p.textDocument.uri, p.position, p.context.includeDeclaration);
});
connection.onHover(async p => {
  await ready;
  return hover(ws, p.textDocument.uri, p.position);
});
connection.onCompletion(async p => {
  await ready;
  const doc = documents.get(p.textDocument.uri);
  return doc ? completion(ws, doc, p.position) : [];
});

documents.listen(connection);
connection.listen();

