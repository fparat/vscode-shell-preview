import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { promisify } from 'node:util';
import { exec as execCallback } from 'node:child_process';

const exec = promisify(execCallback);

const KILL_TIMEOUT = 20;

type CommandConfig = {
    command: string,
    killTimeout: number,
}

/** Get a command configuration given a command key */
function getCommandConfig(commandKey: string): CommandConfig | null {
    const commands = vscode.workspace.getConfiguration("shell-preview").get("commands") as {
        [key: string]: string | CommandConfig
    };

    const command = commands[commandKey];
    if (!command) {
        return null;
    }

    if (typeof command === "string") {
        return {
            command: command,
            killTimeout: KILL_TIMEOUT,
        };
    } else {
        // Ensure the returned object matches CommandConfig
        return {
            command: command.command,
            killTimeout: command.killTimeout ?? KILL_TIMEOUT
        };
    }
}

/** Find the command key associated to the given file name or path in the configuration. */
function getAssociatedCommand(filePath: string): string | null {
    console.log(`Get associated command: ${filePath}`);
    const fileName = path.basename(filePath);
    console.log(`fileName: ${fileName}`);
    const associations = vscode.workspace.getConfiguration("shell-preview").get("fileAssociations") as {
        [key: string]: string,
    };
    console.log(`Associations: ${associations}`);

    for (const [key, value] of Object.entries(associations)) {
        console.log(`assoc: ${key} -> ${value}`);
        if (minimatch(fileName, key)) {
            console.log(`Found`);
            return value;
        }
    }

    console.log(`Not found`);
    return null;
}

/** Find the command key for the given uri, or ask the user with a QuickPick prompt. */
async function getCommandKeyForUri(uri: vscode.Uri): Promise<string | null> {
    const fsPath = uri.fsPath;
    console.log(`Path: ${fsPath}`);
    let commandKey = getAssociatedCommand(fsPath);
    if (!commandKey) {
        console.log("Pick command");

        const commands = vscode.workspace.getConfiguration("shell-preview").get("commands") as {
            [key: string]: string | CommandConfig
        };

        const items = Object.keys(commands);
        console.log("Show QuickPick");
        const result = await vscode.window.showQuickPick(items, { canPickMany: false });
        console.log("QuickPick finished");
        if (!result) {
            // TODO really cancel
            console.log("Pick cancelled");
            // return `<FAILED: user pick cancelled>`;
            return null;
        }

        console.log(`Pick result: ${result}`);
        commandKey = result;
    }
    console.log(`Command key: ${commandKey}`);

    return commandKey;
}


export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "shell-preview.viewOutput",
            convertTextCommand(context)
        )
    );

    console.log('Extension activated');
}

// This method is called when your extension is deactivated
export function deactivate() { }


function convertTextCommand(context: vscode.ExtensionContext) {
    const convertTextScheme = 'shell-preview';

    const convertTextProvider = new (class implements vscode.TextDocumentContentProvider {
        onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
        onDidChange = this.onDidChangeEmitter.event;

        async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
            console.log(`Callback provideTextDocumentContent: ${uri}`);

            const searchParams = new URLSearchParams(uri.query);
            const commandKey = searchParams.get("cmd");
            // TODO cleaner error
            if (!commandKey) {
                console.error(`Missing command query parameter: ${uri.toString()}`);
                return `<FAILED: missing command query parameter>`;
            }

            const command_config = getCommandConfig(commandKey);
            if (!command_config) {
                // TODO cleaner error
                console.error(`Command key not found: ${commandKey}`);
                return `<FAILED: command key not found "${commandKey}">`;
            }
            const command = command_config.command.replaceAll("${file}", `'${uri.path}'`);

            // TODO display warning if processing too long
            // TODO real-time update of the preview for long commands, is it possible?
            console.log(`Execute: ${command} (timeout: ${command_config.killTimeout}s)`);

            let stdout = "";
            let stderr = "";
            let exitCode: number | undefined = 0;
            let wasKilled = false;

            try {
                const result = await exec(command, { timeout: command_config.killTimeout * 1000 });
                stdout = result.stdout;
                stderr = result.stderr;
                console.log("Command success");
            } catch (e: unknown) {
                const error = e as { code?: number, stdout?: string, stderr?: string, killed?: boolean, signal?: string };
                exitCode = error.code;
                stdout = error.stdout || "";
                stderr = error.stderr || "";
                wasKilled = !!error.killed;
                console.error(`Command failed: exit code ${exitCode}, killed: ${wasKilled}, signal: ${error.signal}`);
            }

            const displayExitCode = exitCode !== undefined ? exitCode : "<undefined>";
            let output = `# Command: ${command}\n`;
            if (wasKilled) {
                output += `# Terminated: exceeded timeout of ${command_config.killTimeout}s\n`;
            }
            if (exitCode !== 0 || wasKilled) {
                output += `# Exit code: ${displayExitCode}\n`;
            }

            if (stderr.length > 0) {
                if (stdout.length > 0) {
                    output += `\n# Stdout ${"-".repeat(72)}\n${stdout}`;
                }
                output += `\n# Stderr ${"-".repeat(72)}\n${stderr}`;
            } else if (stdout.length > 0) {
                output += stdout;
            }

            return output;
        }
    })();

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(convertTextScheme, convertTextProvider)
    );


    return async () => {
        console.log("Convert text callback");
        const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
            uri: vscode.Uri | undefined
        } | undefined;

        if (!activeTabInput?.uri) {
            console.log("No active tab");
            vscode.window.showInformationMessage("No active tab");
            return "";
        }

        const activeEditorUri = activeTabInput.uri;
        console.assert(activeEditorUri.scheme === "file", `not a file: ${activeEditorUri}`);

        const commandKey = await getCommandKeyForUri(activeEditorUri);
        console.log(`Found command key: ${commandKey}`);
        if (!commandKey) {
            console.log(`No command key for uri ${activeEditorUri}`);
            return "";
        }

        console.log(`Active editor: ${activeEditorUri.path}`);
        const virtualDocUri = vscode.Uri.parse(`${convertTextScheme}:${activeEditorUri.path}?cmd=${commandKey}`);
        convertTextProvider.onDidChangeEmitter.fire(virtualDocUri); // force re-processing

        console.log(`Open Text Document: ${virtualDocUri.path}`);
        const doc = await vscode.workspace.openTextDocument(virtualDocUri);
        console.log(`Opened text document: ${doc.uri}`);
        await vscode.window.showTextDocument(doc, { preview: false });
    };
}

