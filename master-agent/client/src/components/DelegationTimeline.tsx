import React from 'react';
import { DelegationEvent } from '../services/delegationClient';

export interface DelegationEntry {
  ts: number;
  event: DelegationEvent;
  data: any;
}

interface Props {
  entries: DelegationEntry[];
  title?: string;
  running?: boolean;
  limit?: number;
}

const eventColor: Record<DelegationEvent, string> = {
  start: 'text-blue-300',
  plan: 'text-amber-200',
  agent_result: 'text-emerald-200',
  agent_error: 'text-red-300',
  done: 'text-emerald-300',
  ping: 'text-slate-400',
  error: 'text-red-400',
  parse_error: 'text-red-400',
  message: 'text-slate-300'
};

export const DelegationTimeline: React.FC<Props> = ({ entries, title = 'Delegation Timeline', running = false, limit = 20 }) => {
  if (!entries || entries.length === 0) {
    return (
      <div className="border border-dashed border-slate-700 rounded-lg p-3 text-sm text-slate-400 bg-slate-900/40">
        No delegation activity yet.
      </div>
    );
  }

  const sliced = entries.slice(-limit).sort((a, b) => a.ts - b.ts);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-100">{title}</h4>
        {running && <span className="text-[11px] px-2 py-1 rounded-full bg-blue-900/60 text-blue-100">Running</span>}
      </div>
      <div className="space-y-1 text-xs">
        {sliced.map((entry, idx) => {
          const color = eventColor[entry.event] || 'text-slate-200';
          const label = entry.event.replace('_', ' ');
          const content = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data);
          return (
            <div key={`${entry.ts}-${idx}`} className="flex items-start gap-2">
              <span className={`font-semibold ${color}`}>{label}</span>
              <span className="text-slate-400 whitespace-pre-wrap break-words flex-1" title={content}>
                {content}
              </span>
              <span className="text-slate-500 min-w-[70px] text-right">
                {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DelegationTimeline;
