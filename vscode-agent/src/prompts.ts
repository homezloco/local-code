type PlannerInput = { question: string; selection: string };
type CodegenInput = { question: string; selection: string };
type SummarizeInput = { selection: string };

export function buildPlannerPrompt(input: PlannerInput): string {
  return [
    'You are the planner. Goal: ask clarifying questions, propose steps, and decide which agent/model should act.',
    'Respond concisely.',
    `User question: ${input.question}`,
    input.selection ? `Selection:\n${input.selection}` : 'Selection: (none)',
    'Return: numbered clarifying questions (if needed) and a 3-7 step plan with agent role suggestions.'
  ].join('\n\n');
}

export function buildCodegenPrompt(input: CodegenInput): string {
  return [
    'You are the coder. Given the request and optional selection, produce a unified diff.',
    'Keep changes minimal, safe, and focused. If context is insufficient, state what is missing.',
    `Task: ${input.question}`,
    input.selection ? `Selection:\n${input.selection}` : 'Selection: (none)',
    'Return: unified diff only (no prose).'
  ].join('\n\n');
}

export function buildSummarizePrompt(input: SummarizeInput): string {
  return [
    'Summarize the following text concisely. Include key decisions and action items.',
    input.selection || '(empty)'
  ].join('\n\n');
}
