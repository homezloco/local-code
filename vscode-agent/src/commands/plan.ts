import * as vscode from 'vscode';
import { callAgentServicePlan } from '../services/agentService';
import { getSettings } from '../config';

export async function runPlan(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selection = editor?.document.getText(editor.selection) ?? '';
  const question = await vscode.window.showInputBox({ prompt: 'What do you want the agent to do?' });
  if (!question) {
    return;
  }

  try {
    const settings = getSettings();
    const resp = await callAgentServicePlan(settings.agentServiceUrl, question, selection);
    const message = resp.plan ?? 'No response';
    vscode.window.showInformationMessage(message);
  } catch (error) {
    const err = error as Error;
    vscode.window.showErrorMessage(`Planner error: ${err.message}`);
  }
}
