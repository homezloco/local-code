import * as vscode from 'vscode';
import { refreshIndex as doRefresh } from '../ragClient';

export async function runRefreshIndex(): Promise<void> {
  const progressOptions = { location: vscode.ProgressLocation.Notification, title: 'Refreshing RAG index...' };
  await vscode.window.withProgress(progressOptions, async () => {
    try {
      const result = await doRefresh();
      vscode.window.showInformationMessage(`RAG index refreshed (${result.indexed} chunks).`);
    } catch (error) {
      vscode.window.showErrorMessage(`RAG refresh failed: ${(error as Error).message}`);
    }
  });
}
