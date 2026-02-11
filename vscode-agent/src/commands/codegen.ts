import * as vscode from 'vscode';
import { generate } from '../providers';
import { getSettings } from '../config';
import { buildCodegenPrompt } from '../prompts';
export async function runCodegen(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selection = editor?.document.getText(editor.selection) ?? '';
  const question = await vscode.window.showInputBox({ prompt: 'Describe the change to generate.' });
  if (!question) return;
  const settings = getSettings();
  const prompt = buildCodegenPrompt({ question, selection });
  try {
    const resp = await generate(settings.defaultCoder, prompt);
    const diff = resp ?? '';
    const doc = await vscode.workspace.openTextDocument({ content: diff, language: 'diff' });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  } catch (error) {
    vscode.window.showErrorMessage(`Codegen error: ${(error as Error).message}`);
  }
}
