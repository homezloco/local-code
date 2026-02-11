import * as vscode from 'vscode';
import { getSettings } from '../config';

export async function runSelectModel(): Promise<void> {
  const settings = getSettings();
  const entries = settings.models;
  if (!entries.length) {
    vscode.window.showInformationMessage('No models configured in settings (agent.models).');
    return;
  }
  const picked = await vscode.window.showQuickPick(entries.map((m) => `${m.name} (${m.provider})`), {
    placeHolder: 'Select a model (planner/coder override not persisted in scaffold)',
  });
  if (!picked) return;
  vscode.window.showInformationMessage(`Selected model: ${picked} (not persisted in scaffold).`);
}
