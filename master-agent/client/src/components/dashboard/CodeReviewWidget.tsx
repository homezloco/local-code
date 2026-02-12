import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface CodeFile {
  path: string;
  action: 'create' | 'modify' | 'delete';
  language: string;
  content: string;
  description: string;
  safe: boolean;
  exists: boolean;
}

interface CodePreview {
  structured: boolean;
  summary?: string;
  files?: CodeFile[];
  testStrategy?: string;
  risks?: string;
  raw?: string;
  delegationId: string;
  taskId: string;
}

interface CodeReviewWidgetProps {
  delegationId: string;
  taskTitle: string;
  onClose: () => void;
  onApplied?: () => void;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-700 text-green-100',
  modify: 'bg-yellow-700 text-yellow-100',
  delete: 'bg-red-700 text-red-100',
};

const LANG_LABELS: Record<string, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'PY',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  markdown: 'MD',
  bash: 'SH',
  sql: 'SQL',
};

const CodeReviewWidget: React.FC<CodeReviewWidgetProps> = ({
  delegationId,
  taskTitle,
  onClose,
  onApplied,
}) => {
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appliedFiles, setAppliedFiles] = useState<Record<number, boolean>>({});
  const [applyingFile, setApplyingFile] = useState<number | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Record<number, boolean>>({});
  const [applyAllLoading, setApplyAllLoading] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        setLoading(true);
        const resp = await axios.get(`http://localhost:3001/code/preview/${delegationId}`);
        setPreview(resp.data);
        if (resp.data.files) {
          const expanded: Record<number, boolean> = {};
          resp.data.files.forEach((_: CodeFile, i: number) => { expanded[i] = true; });
          setExpandedFiles(expanded);
        }
      } catch (err: any) {
        setError(err?.response?.data?.error || err?.message || 'Failed to load code preview');
      } finally {
        setLoading(false);
      }
    };
    fetchPreview();
  }, [delegationId]);

  const handleApplyFile = async (index: number) => {
    try {
      setApplyingFile(index);
      await axios.post('http://localhost:3001/code/apply', { delegationId, fileIndex: index });
      setAppliedFiles((prev) => ({ ...prev, [index]: true }));
      onApplied?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Apply failed');
    } finally {
      setApplyingFile(null);
    }
  };

  const handleApplyAll = async () => {
    try {
      setApplyAllLoading(true);
      const resp = await axios.post('http://localhost:3001/code/apply-all', { delegationId });
      const applied: Record<number, boolean> = {};
      resp.data.results?.forEach((r: { applied: boolean }, i: number) => {
        if (r.applied) applied[i] = true;
      });
      setAppliedFiles(applied);
      onApplied?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Apply all failed');
    } finally {
      setApplyAllLoading(false);
    }
  };

  const handleOpenInVSCode = async (file: CodeFile) => {
    try {
      await axios.post('http://localhost:3001/code/open-in-vscode', {
        filePath: file.path,
        content: file.content,
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to open in VS Code');
    }
  };

  const toggleFile = (index: number) => {
    setExpandedFiles((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-8 text-white">Loading code preview...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              💻 Code Review
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">{taskTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {preview?.structured && preview.files && preview.files.length > 0 && (
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
                onClick={handleApplyAll}
                disabled={applyAllLoading}
              >
                {applyAllLoading ? 'Applying...' : `✓ Apply All (${preview.files.length} files)`}
              </button>
            )}
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-600 hover:bg-slate-500 text-white transition-colors"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">
              {error}
            </div>
          )}

          {preview?.structured && preview.summary && (
            <div className="p-3 rounded-lg bg-slate-700/50 border border-slate-600">
              <p className="text-sm font-medium text-slate-300">Summary</p>
              <p className="text-sm text-white mt-1">{preview.summary}</p>
            </div>
          )}

          {preview?.structured && preview.files?.map((file, index) => (
            <div
              key={index}
              className={`rounded-lg border ${
                appliedFiles[index]
                  ? 'border-green-600 bg-green-900/20'
                  : 'border-slate-600 bg-slate-900/50'
              }`}
            >
              {/* File header */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-700/30"
                onClick={() => toggleFile(index)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[file.action] || 'bg-slate-600 text-slate-200'}`}>
                    {file.action}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-xs bg-slate-600 text-slate-300">
                    {LANG_LABELS[file.language] || file.language}
                  </span>
                  <code className="text-sm text-blue-300 truncate">{file.path}</code>
                  {file.exists && <span className="text-xs text-slate-500">(exists)</span>}
                  {!file.safe && <span className="text-xs text-red-400">⚠ blocked path</span>}
                  {appliedFiles[index] && <span className="text-xs text-green-400">✓ applied</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!appliedFiles[index] && file.safe && (
                    <>
                      <button
                        type="button"
                        className="px-2 py-1 rounded text-xs font-medium bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
                        onClick={(e) => { e.stopPropagation(); handleApplyFile(index); }}
                        disabled={applyingFile === index}
                      >
                        {applyingFile === index ? '...' : '✓ Apply'}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleOpenInVSCode(file); }}
                      >
                        VS Code
                      </button>
                    </>
                  )}
                  <span className="text-slate-500 text-sm">{expandedFiles[index] ? '▼' : '▶'}</span>
                </div>
              </div>

              {/* File description */}
              {file.description && (
                <div className="px-3 pb-2">
                  <p className="text-xs text-slate-400">{file.description}</p>
                </div>
              )}

              {/* Code content */}
              {expandedFiles[index] && (
                <div className="border-t border-slate-700">
                  <pre className="p-3 text-xs text-green-200 bg-slate-950 overflow-x-auto max-h-96 font-mono leading-relaxed">
                    <code>{file.content}</code>
                  </pre>
                </div>
              )}
            </div>
          ))}

          {/* Raw text fallback for non-structured results */}
          {preview && !preview.structured && preview.raw && (
            <div className="rounded-lg border border-slate-600 bg-slate-900/50">
              <div className="p-3 border-b border-slate-700">
                <p className="text-sm font-medium text-slate-300">Agent Output (raw text)</p>
              </div>
              <pre className="p-3 text-xs text-slate-200 bg-slate-950 overflow-x-auto max-h-[60vh] font-mono leading-relaxed whitespace-pre-wrap">
                {preview.raw}
              </pre>
            </div>
          )}

          {/* Test strategy & risks */}
          {preview?.structured && (preview.testStrategy || preview.risks) && (
            <div className="grid grid-cols-2 gap-3">
              {preview.testStrategy && (
                <div className="p-3 rounded-lg bg-slate-700/30 border border-slate-600">
                  <p className="text-xs font-medium text-slate-400 mb-1">🧪 Test Strategy</p>
                  <p className="text-xs text-slate-200">{preview.testStrategy}</p>
                </div>
              )}
              {preview.risks && (
                <div className="p-3 rounded-lg bg-slate-700/30 border border-slate-600">
                  <p className="text-xs font-medium text-slate-400 mb-1">⚠️ Risks</p>
                  <p className="text-xs text-slate-200">{preview.risks}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeReviewWidget;
