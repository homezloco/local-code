import React from 'react';

interface ClarificationModalProps {
  taskId: string;
  questions: string[];
  answers: string[];
  onChangeAnswer: (index: number, value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const ClarificationModal: React.FC<ClarificationModalProps> = ({ taskId, questions, answers, onChangeAnswer, onSubmit, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white text-slate-900 rounded-lg shadow-2xl w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Agent needs clarification</h2>
            <p className="text-sm text-slate-600">Task: {taskId}</p>
          </div>
          <button className="text-slate-500 hover:text-slate-800" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={idx} className="space-y-2">
              <div className="text-sm font-medium text-slate-800">Question {idx + 1}</div>
              <div className="text-sm text-slate-700">{q}</div>
              <textarea
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={answers[idx]}
                onChange={(e) => onChangeAnswer(idx, e.target.value)}
                placeholder="Your answer"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={onSubmit}
            disabled={answers.every((a) => !a.trim())}
          >
            Submit & Resume
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClarificationModal;
