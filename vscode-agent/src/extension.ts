import * as vscode from 'vscode';
import { runPlan } from './commands/plan';
import { runCodegen } from './commands/codegen';
import { runSummarize } from './commands/summarize';
import { runRefreshIndex } from './commands/refreshIndex';
import { runSelectModel } from './commands/selectModel';

export function activate(context: vscode.ExtensionContext): void {
  const disposables = [
    vscode.commands.registerCommand('agent.planAnswer', () => runPlan()),
    vscode.commands.registerCommand('agent.codegen', () => runCodegen()),
    vscode.commands.registerCommand('agent.summarize', () => runSummarize()),
    vscode.commands.registerCommand('agent.refreshIndex', () => runRefreshIndex()),
    vscode.commands.registerCommand('agent.selectModel', () => runSelectModel()),
  ];

  context.subscriptions.push(...disposables);
}

export function deactivate(): void {
  // noop
}
