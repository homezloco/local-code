import React, { useState } from 'react';
import type { AgentSuggestion } from './types';
import { getPriorityColor, CopyButton } from './helpers';

const AGENT_COLORS: Record<string, string> = {
  'email-agent': 'border-blue-400 bg-slate-800',
  'coding-agent': 'border-emerald-400 bg-slate-800',
  'investment-agent': 'border-amber-400 bg-slate-800',
  'social-media-agent': 'border-pink-400 bg-slate-800',
  'time-management-agent': 'border-cyan-400 bg-slate-800',
};

const AGENT_ICONS: Record<string, string> = {
  'email-agent': '✉️',
  'coding-agent': '💻',
  'investment-agent': '📈',
  'social-media-agent': '📱',
  'time-management-agent': '⏰',
};

interface ConversationMessage {
  role: 'user' | 'agent';
  text: string;
  at: string;
}

interface SuggestionsWidgetProps {
  suggestions: AgentSuggestion[];
  savedSuggestions: AgentSuggestion[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
  onReply: (id: string, reply: string) => Promise<string | null>;
  onRefresh: () => void;
  loading?: boolean;
}

const SuggestionsWidget: React.FC<SuggestionsWidgetProps> = ({
  suggestions,
  savedSuggestions,
  onAccept,
  onReject,
  onSave,
  onUnsave,
  onReply,
  onRefresh,
  loading,
}) => {
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyLoading, setReplyLoading] = useState<Record<string, boolean>>({});
  const [conversations, setConversations] = useState<Record<string, ConversationMessage[]>>({});

  const toggleReply = (id: string) => {
    setExpandedReplies((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleReply = async (id: string) => {
    const text = (replyInputs[id] || '').trim();
    if (!text) return;

    setReplyLoading((prev) => ({ ...prev, [id]: true }));

    const userMsg: ConversationMessage = { role: 'user', text, at: new Date().toISOString() };
    setConversations((prev) => ({
      ...prev,
      [id]: [...(prev[id] || []), userMsg]
    }));
    setReplyInputs((prev) => ({ ...prev, [id]: '' }));

    const agentReply = await onReply(id, text);

    if (agentReply) {
      const agentMsg: ConversationMessage = { role: 'agent', text: agentReply, at: new Date().toISOString() };
      setConversations((prev) => ({
        ...prev,
        [id]: [...(prev[id] || []), agentMsg]
      }));
    }

    setReplyLoading((prev) => ({ ...prev, [id]: false }));
  };

  const grouped = suggestions.reduce<Record<string, AgentSuggestion[]>>((acc, s) => {
    if (!acc[s.agentName]) acc[s.agentName] = [];
    acc[s.agentName].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white">🧠 Agent Suggestions</h3>
          {suggestions.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-purple-600 text-white font-medium">
              {suggestions.length}
            </span>
          )}
        </div>
        <button
          type="button"
          className="text-sm px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-50"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? '\u21BB Scanning...' : '\u21BB Refresh'}
        </button>
      </div>

      {savedSuggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-white">
            <span>📌</span>
            <span className="font-medium">Saved for Later</span>
            <span className="text-slate-400">({savedSuggestions.length})</span>
          </div>
          {savedSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="border-l-4 border-amber-500 rounded-lg p-4 bg-amber-900/20 transition-all hover:shadow-lg"
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-white text-sm">
                    {AGENT_ICONS[suggestion.agentName] || '🤖'} {suggestion.title}
                  </h4>
                  {suggestion.description && (
                    <p className="text-sm text-gray-200 mt-1">{suggestion.description}</p>
                  )}
                  {suggestion.rationale && (
                    <p className="text-sm text-yellow-300 mt-1 italic">💡 {suggestion.rationale}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-600 text-slate-200">
                      {suggestion.agentName.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${getPriorityColor(suggestion.priority)}`}>
                      {suggestion.priority}
                    </span>
                    <CopyButton text={[suggestion.title, suggestion.description, suggestion.rationale].filter(Boolean).join('\n\n')} />
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    className="px-3 py-1 rounded-md text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
                    onClick={() => onAccept(suggestion.id)}
                  >
                    ✓ Accept
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-md text-xs font-medium bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors"
                    onClick={() => onUnsave(suggestion.id)}
                  >
                    📌 Unpin
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {suggestions.length === 0 && savedSuggestions.length === 0 && (
        <div className="border border-dashed border-slate-600 rounded-lg p-6 text-center text-slate-300 bg-slate-800/60">
          <p className="text-lg mb-1 text-white">🤖 Agents are thinking...</p>
          <p className="text-sm">Click Refresh to have agents scan for suggestions, or they'll appear automatically.</p>
        </div>
      )}

      {Object.entries(grouped).map(([agentName, agentSuggestions]) => (
        <div key={agentName} className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-white">
            <span>{AGENT_ICONS[agentName] || '🤖'}</span>
            <span className="font-medium">
              {agentName.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </span>
            <span className="text-slate-400">({agentSuggestions.length})</span>
          </div>

          {agentSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className={`border-l-4 rounded-lg p-4 transition-all hover:shadow-lg ${
                AGENT_COLORS[agentName] || 'border-slate-500 bg-slate-900/20'
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-white text-sm">{suggestion.title}</h4>
                  {suggestion.description && (
                    <p className="text-sm text-gray-200 mt-1 line-clamp-2">{suggestion.description}</p>
                  )}
                  {suggestion.rationale && (
                    <p className="text-sm text-yellow-300 mt-1 italic">
                      💡 {suggestion.rationale}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${getPriorityColor(suggestion.priority)}`}>
                      {suggestion.priority}
                    </span>
                    {suggestion.category && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-slate-600 text-white">
                        {suggestion.category}
                      </span>
                    )}
                    {suggestion.confidence != null && (
                      <span className="text-xs text-gray-300">
                        {Math.round(suggestion.confidence * 100)}% confidence
                      </span>
                    )}
                    <CopyButton text={[suggestion.title, suggestion.description, suggestion.rationale].filter(Boolean).join('\n\n')} />
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    className="px-3 py-1 rounded-md text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
                    onClick={() => onAccept(suggestion.id)}
                  >
                    ✓ Accept
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                    onClick={() => onSave(suggestion.id)}
                  >
                    📌 Save
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    onClick={() => toggleReply(suggestion.id)}
                  >
                    💬 Reply
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-md text-xs font-medium bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors"
                    onClick={() => onReject(suggestion.id)}
                  >
                    ✗ Dismiss
                  </button>
                </div>
              </div>

              {(expandedReplies[suggestion.id] || (conversations[suggestion.id] && conversations[suggestion.id].length > 0)) && (
                <div className="mt-3 border-t border-slate-700 pt-3 space-y-2">
                  {(conversations[suggestion.id] || []).map((msg, idx) => (
                    <div
                      key={idx}
                      className={`text-sm rounded-lg px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-blue-900/40 text-blue-100 ml-8'
                          : 'bg-slate-700/60 text-gray-100 mr-8'
                      }`}
                    >
                      <span className="text-xs font-medium text-slate-400 block mb-0.5">
                        {msg.role === 'user' ? 'You' : suggestion.agentName.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </span>
                      {msg.text}
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 rounded-lg border border-slate-600 bg-slate-900 text-white text-sm px-3 py-1.5 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                      placeholder={`Reply to ${suggestion.agentName.split('-')[0]} agent...`}
                      value={replyInputs[suggestion.id] || ''}
                      onChange={(e) => setReplyInputs((prev) => ({ ...prev, [suggestion.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleReply(suggestion.id);
                        }
                      }}
                      disabled={replyLoading[suggestion.id]}
                    />
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
                      onClick={() => handleReply(suggestion.id)}
                      disabled={replyLoading[suggestion.id] || !(replyInputs[suggestion.id] || '').trim()}
                    >
                      {replyLoading[suggestion.id] ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default SuggestionsWidget;
