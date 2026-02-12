import React from 'react';
import type { ResultItem, SecretFormFields } from './types';

interface SettingsWidgetProps {
  plannerModel: string;
  coderModel: string;
  ragK: number;
  mainWidth: number;
  activeZone: string;
  customModels: { name: string }[];
  lastResult: ResultItem | null;
  secretStatus: Record<string, boolean>;
  secretForm: SecretFormFields;
  setSecretForm: React.Dispatch<React.SetStateAction<SecretFormFields>>;
  handleSecretsSubmit: (event: React.FormEvent) => Promise<void>;
}

const SettingsWidget: React.FC<SettingsWidgetProps> = ({
  plannerModel,
  coderModel,
  ragK,
  mainWidth,
  activeZone,
  customModels,
  lastResult,
  secretStatus,
  secretForm,
  setSecretForm,
  handleSecretsSubmit,
}) => (
  <div className="space-y-3 text-sm">
    <h3 className="text-lg font-semibold text-gray-900">Settings</h3>
    <div className="rounded border border-slate-200 bg-gray-50 p-3 text-gray-800 space-y-1">
      <div><span className="font-semibold">Planner model:</span> {plannerModel}</div>
      <div><span className="font-semibold">Coder model:</span> {coderModel}</div>
      <div><span className="font-semibold">RAG k:</span> {ragK}</div>
      <div><span className="font-semibold">Main width:</span> {mainWidth}%</div>
      <div><span className="font-semibold">Active zone:</span> {activeZone}</div>
      <div><span className="font-semibold">Custom models:</span> {customModels.length}</div>
      <div><span className="font-semibold">Last result:</span> {lastResult?.title || 'None'}</div>
    </div>
    <div className="rounded border border-slate-200 bg-white p-3 text-gray-800 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-md font-semibold text-gray-900">Secrets</h4>
        <span className="text-xs text-gray-500">Stored server-side (write-only)</span>
      </div>
      <form className="space-y-2" onSubmit={handleSecretsSubmit}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.keys(secretForm).map((key) => (
            <div key={key} className="flex flex-col">
              <label className="text-xs font-semibold text-gray-700">{key}</label>
              <input
                type={key.toLowerCase().includes('pass') || key.toLowerCase().includes('key') ? 'password' : 'text'}
                className="border border-slate-200 rounded px-2 py-1 text-sm text-gray-900"
                value={(secretForm as any)[key]}
                onChange={(e) => setSecretForm((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={secretStatus[key] ? 'Set' : ''}
              />
              <span className="text-[11px] text-gray-500">{secretStatus[key] ? 'Set' : 'Not set'}</span>
            </div>
          ))}
        </div>
        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center rounded bg-blue-600 px-3 py-1 text-white text-sm hover:bg-blue-700"
        >
          Save secrets
        </button>
        <div className="text-xs text-gray-500">After saving, restart services to load new env.</div>
      </form>
    </div>
  </div>
);

export default SettingsWidget;
