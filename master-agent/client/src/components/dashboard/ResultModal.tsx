import React from 'react';
import type { ResultPayload } from './types';
import { renderMarkdown, CopyButton } from './helpers';

interface ResultModalProps {
  resultModal: ResultPayload;
  onClose: () => void;
  onRetry?: () => void;
  loading?: boolean;
}

const ResultModal: React.FC<ResultModalProps> = ({ resultModal, onClose, onRetry, loading }) => {
  const hasError = !!resultModal.meta?.error;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <h2 className="text-lg font-semibold text-white truncate pr-4">{resultModal.title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <CopyButton text={resultModal.body} />
            <button
              className="text-slate-400 hover:text-white text-xl leading-none px-2 transition-colors"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {hasError && (
          <div className="bg-red-900/20 border-b border-red-900/50 p-4 flex items-start gap-3">
            <div className="text-2xl">❌</div>
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold text-sm">Task Failed</h3>
              <p className="text-red-300 text-sm mt-1 whitespace-pre-wrap font-mono bg-red-950/30 p-2 rounded">
                {resultModal.meta?.error}
              </p>
              {onRetry && (
                <button
                  onClick={() => {
                    onRetry();
                    onClose();
                  }}
                  className="mt-3 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded transition-colors flex items-center gap-2"
                >
                  🔄 Retry Task
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="animate-spin inline-block w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full mb-3" />
              <p>Loading full result...</p>
            </div>
          ) : (
            <>
              {/* Metadata */}
              {resultModal.meta && (
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 bg-slate-800/30 p-3 rounded-lg border border-slate-700/50">
                  {resultModal.meta.model && <div><span className="text-slate-500">Model:</span> {resultModal.meta.model}</div>}
                  {resultModal.meta.fallback && <div><span className="text-slate-500">Fallback:</span> {resultModal.meta.fallback}</div>}
                  {resultModal.meta.status && <div><span className="text-slate-500">Status:</span> <span className={String(resultModal.meta.status) === 'completed' ? 'text-green-400' : 'text-slate-300'}>{resultModal.meta.status}</span></div>}
                  <div><span className="text-slate-500">Time:</span> {new Date().toLocaleTimeString()}</div>
                </div>
              )}

              {/* Main Body */}
              <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                {renderMarkdown(resultModal.body)}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/30 rounded-b-xl flex justify-end gap-2">
          {hasError && onRetry && (
            <button
              className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
              onClick={() => {
                onRetry();
                onClose();
              }}
            >
              Retry
            </button>
          )}
          <button
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultModal;
