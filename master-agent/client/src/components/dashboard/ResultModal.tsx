import React from 'react';
import type { ResultPayload } from './types';
import { renderMarkdown, CopyButton } from './helpers';

interface ResultModalProps {
  resultModal: ResultPayload;
  onClose: () => void;
}

const ResultModal: React.FC<ResultModalProps> = ({ resultModal, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">{resultModal.title}</h2>
        <div className="flex items-center gap-2">
          <CopyButton text={resultModal.body} />
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      {resultModal.meta && (
        <div className="text-xs text-gray-600 mb-3 space-y-1">
          <div>Model: {resultModal.meta.model || 'n/a'}</div>
          {resultModal.meta.fallback && <div>Fallback: {resultModal.meta.fallback}</div>}
          {resultModal.meta.status && <div>Status: {resultModal.meta.status}</div>}
          {resultModal.meta.error && <div className="text-red-600">Error: {resultModal.meta.error}</div>}
        </div>
      )}
      <div className="rounded border border-gray-200 bg-gray-50 p-3 max-h-96 overflow-auto text-sm text-gray-900">
        {renderMarkdown(resultModal.body)}
      </div>
      <div className="flex justify-end mt-4">
        <button
          className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  </div>
);

export default ResultModal;
