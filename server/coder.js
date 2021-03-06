'use strict';

const langserver_1 = require('vscode-languageserver');
const fs_1 = require('fs');
const path_1 = require('path');
const uri_1 = require('vscode-uri').default;
const tracer_1 = require('./tracer');
const symbol_manager_1 = require('./providers/lib/symbol-manager');
const file_manager_1 = require('./providers/lib/file-manager');
const symbol_provider_1 = require('./providers/symbol-provider');
const definition_provider_1 = require('./providers/definition-provider');
const completion_provider_1 = require('./providers/completion-provider');
const diagnostic_provider_1 = require('./providers/diagnostic-provider');
const hover_provider_1 = require('./providers/hover-provider');
const signature_provider = require('./providers/signature-provider');
const rename_provider = require('./providers/rename-provider');
const format_provider = require('./providers/format-provider');
const ldoc_provider = require('./providers/ldoc-provider');

class Coder {
    constructor() {
        this.workspaceRoot = undefined;
        this.conn = undefined;
        this.documents = undefined;
        this.settings = undefined;
        this.tracer = tracer_1.instance();

        this._initialized = false;
    }

    init(context) {
        if (this._initialized) {
            return true;
        }

        if (!context || !context.connection || !context.documents) {
            return false;
        }

        this.workspaceRoot = context.workspaceRoot;
        this.conn = context.connection;
        this.documents = context.documents;
        this._initialized = true;

        this.tracer.init(this);
        this._symbolProvider = new symbol_provider_1.SymbolProvider(this);
        this._definitionProvider = new definition_provider_1.DefinitionProvider(this);
        this._completionProvider = new completion_provider_1.CompletionProvider(this);
        this._diagnosticProvider = new diagnostic_provider_1.DiagnosticProvider(this);
        this._hoverProvider = new hover_provider_1.HoverProvider(this);
        this._signatureProvider = new signature_provider.SignatureProvider(this);
        this._renameProvider = new rename_provider.RenameProvider(this);
        this._formatProvider = new format_provider.FormatProvider(this);
        this._ldocProvider = new ldoc_provider.LDocProvider(this);

        this.conn.console.info('coder inited');

        return true;
    }

    initialized() {
        return this._initialized;
    }

    document(uri) {
        var document = this.documents.get(uri);
        if (document) {
            return document;
        }

        var fileName = uri_1.parse(uri).fsPath;
        document = langserver_1.TextDocument.create(uri, "lua", 0, fs_1.readFileSync(fileName).toString('utf8'));
        return document;
    }

    onDidChangeConfiguration(change) {
        let settings = change.settings.LuaCoderAssist;
        this.settings = settings;
        let fileManager = file_manager_1.instance();
        fileManager.reset();

        if (this.workspaceRoot) {
            fileManager.setRoots(settings.search.externalPaths.concat(this.workspaceRoot));
        }

        fileManager.searchFiles(settings.search, ".lua");

        // todo:
        symbol_manager_1.instance().updateOptions(settings);
    }

    onDidChangeContent(change) {
        let uri = change.document.uri;
        symbol_manager_1.instance().parseDocument(
            uri,
            change.document.getText(),
            change.document.lineCount
        ).then(ok => {
            this._diagnosticProvider.provideDiagnostics(uri);
        });
    }

    onDidSave(params) {
        // this.tracer.info('onDidSave');
        // var uri = params.document.uri;
    }

    onDidChangeWatchedFiles(change) {
        change.changes.forEach(event => {
            let uri = event.uri;
            let etype = event.type;
            let filePath = uri_1.parse(uri).fsPath;
            let fileName = path_1.basename(filePath, '.lua');
            let fileManager = file_manager_1.instance();
            let symbolManager = symbol_manager_1.instance();
            switch (etype) {
                case 1: //create
                    fileManager.addFile(fileName, filePath);
                    break;
                case 3: //delete
                    fileManager.delFile(fileName, filePath);
                    symbolManager.deleteDocument(uri);
                default:
                    break;
            }
        });
    }

    provideDocumentSymbols(params) {
        var uri = params.textDocument.uri;
        return this._symbolProvider.provideDocumentSymbols(uri);
    }

    provideDefinitions(params) {
        return this._definitionProvider.provideDefinitions(params);
    }

    provideCompletions(params) {
        return this._completionProvider.provideCompletions(params);
    }

    resolveCompletion(item) {
        return this._completionProvider.resolveCompletion(item);
    }

    provideHover(params) {
        return {
            contents: this._hoverProvider.provideHover(params)
        };
    }

    provideSignatureHelp(params) {
        return this._signatureProvider.provideSignatureHelp(params);
    }

    provideRename(params) {
        return this._renameProvider.provideRename(params);
    }

    formatDocument(params) {
        return this._formatProvider.formatRangeText(params);
    }

    formatOnTyping(params) {
        return this._formatProvider.formatOnTyping(params);
    }

    sendDiagnostics(uri, diagnostics) {
        this.conn.sendDiagnostics({
            uri: uri,
            diagnostics: diagnostics
        });
    }

    showWarningMessage(msg) {
        this.conn.window.showWarningMessage(msg);
    }

    onLDocRequest(params) {
        return this._ldocProvider.onRequest(params);
    }

    onDidClosed(doc) {
        if (!this.settings.luacheck.keepAfterClosed) {
            this.sendDiagnostics(doc.uri, []);
        }
    }
};

var _coderInstance = undefined;
function instance() {
    if (_coderInstance === undefined) {
        _coderInstance = new Coder();
    }

    return _coderInstance;
}

exports.instance = instance;