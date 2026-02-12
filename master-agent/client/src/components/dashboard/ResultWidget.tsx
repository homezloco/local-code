import React from 'react';
import type { ResultItem } from './types';
import { CopyButton } from './helpers';

interface ResultWidgetProps {
  lastResult: ResultItem | null;
  resultHistory: ResultItem[];
  replyText: string;
  setReplyText: React.Dispatch<React.SetStateAction<string>>;
  handleQuickReply: () => Promise<void>;
  actionLoading: boolean;
  pendingWebUrl: string | null;
  setPendingWebUrl: React.Dispatch<React.SetStateAction<string | null>>;
  confirmAndFetchWeb: (url: string) => Promise<boolean>;
  allowAllWeb: boolean;
  setAllowAllWeb: React.Dispatch<React.SetStateAction<boolean>>;
  allowlistWeb: string;
  setAllowlistWeb: React.Dispatch<React.SetStateAction<string>>;
}

const ResultWidget: React.FC<ResultWidgetProps> = ({
  lastResult,
  resultHistory,
  replyText,
  setReplyText,
  handleQuickReply,
  actionLoading,
  pendingWebUrl,
  setPendingWebUrl,
  confirmAndFetchWeb,
  allowAllWeb,
  setAllowAllWeb,
  allowlistWeb,
  setAllowlistWeb,
}) => (
  <div className="space-y-2">
    <h3 className="text-lg font-semibold text-gray-900">Latest Plan/Codegen</h3>
    {lastResult ? (
      <div className="rounded border border-gray-200 bg-gray-50 p-3 max-h-64 overflow-auto text-sm whitespace-pre-wrap">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase text-gray-500">{lastResult.title}</span>
          <CopyButton text={lastResult.body} />
        </div>
        {lastResult.body}
      </div>
    ) : (
      <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-500">
        Run Plan or Codegen to see results here.
      </div>
    )}
    {resultHistory.length > 0 && (
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm space-y-2 max-h-48 overflow-auto">
        <div className="text-xs uppercase text-gray-500">History</div>
        {resultHistory.map((item, idx) => (
          <div key={`${item.at}-${idx}`} className="border-b border-gray-200 pb-2 last:border-b-0 last:pb-0">
            <div className="flex justify-between text-xs text-gray-600">
              <span>{item.title}</span>
              <div className="flex items-center gap-2">
                <CopyButton text={item.body} label="📋" />
                <span>{new Date(item.at).toLocaleTimeString()}</span>
              </div>
            </div>
            <div className="text-gray-800 whitespace-pre-wrap break-words text-sm max-h-24 overflow-hidden">
              {item.body}
            </div>
          </div>
        ))}
      </div>
    )}
    <div className="space-y-2">
      <textarea
        className="w-full rounded border border-gray-200 bg-white text-sm text-gray-900 p-2"
        rows={2}
        placeholder="Quick reply..."
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded bg-indigo-600 px-3 py-1 text-white text-sm hover:bg-indigo-700"
          onClick={handleQuickReply}
          disabled={actionLoading}
        >
          Send
        </button>
      </div>
    </div>
    <div className="space-y-2">
      <input
        type="text"
        className="w-full rounded border border-gray-200 bg-white text-sm text-gray-900 p-2"
        placeholder="Web URL"
        value={pendingWebUrl || ''}
        onChange={(e) => setPendingWebUrl(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded bg-indigo-600 px-3 py-1 text-white text-sm hover:bg-indigo-700"
          onClick={() => confirmAndFetchWeb(pendingWebUrl || '')}
          disabled={actionLoading}
        >
          Fetch Web
        </button>
      </div>
    </div>
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-slate-300">Allow all web</span>
        <input
          type="checkbox"
          className="rounded border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          checked={allowAllWeb}
          onChange={(e) => setAllowAllWeb(e.target.checked)}
        />
      </div>
      <input
        type="text"
        className="w-full rounded border border-gray-200 bg-white text-sm text-gray-900 p-2"
        placeholder="Allowlist (comma-separated)"
        value={allowlistWeb}
        onChange={(e) => setAllowlistWeb(e.target.value)}
      />
    </div>
  </div>
);

export default ResultWidget;
