import React, { useState, useCallback } from 'react';

export const CopyButton: React.FC<{ text: string; className?: string; label?: string }> = ({ text, className, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      type="button"
      className={className || 'text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors'}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? '✓ Copied' : (label || '📋 Copy')}
    </button>
  );
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-200 text-yellow-800';
    case 'delegated':
      return 'bg-purple-200 text-purple-800';
    case 'in_progress':
      return 'bg-blue-200 text-blue-800';
    case 'review':
      return 'bg-orange-200 text-orange-800';
    case 'completed':
      return 'bg-green-200 text-green-800';
    case 'failed':
      return 'bg-red-200 text-red-800';
    default:
      return 'bg-gray-200 text-gray-800';
  }
};

export const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'low':
      return 'bg-gray-200 text-gray-800';
    case 'medium':
      return 'bg-blue-200 text-blue-800';
    case 'high':
      return 'bg-orange-200 text-orange-800';
    case 'urgent':
      return 'bg-red-200 text-red-800';
    default:
      return 'bg-gray-200 text-gray-800';
  }
};

export const renderMarkdown = (text: string): React.ReactElement => {
  const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const withCode = escaped.replace(
    /```([\s\S]*?)```/g,
    '<pre class="bg-white text-gray-900 border border-gray-300 rounded-md p-3 overflow-auto text-sm"><code>$1</code></pre>'
  );
  const withBreaks = withCode.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
  return <div className="prose max-w-none text-gray-900" dangerouslySetInnerHTML={{ __html: withBreaks }} />;
};

export const Skeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, idx) => (
      <div key={idx} className="h-4 rounded bg-slate-800/70 animate-pulse" />
    ))}
  </div>
);
