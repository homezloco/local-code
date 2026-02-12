import React from 'react';

interface AgentForm {
  name: string;
  displayName: string;
  description: string;
  capabilities: string;
  models: string;
  preferredModel: string;
}

interface AgentModalProps {
  open: boolean;
  form: AgentForm;
  error: string;
  editingId: string | null;
  modelOptions: string[];
  onChange: (next: AgentForm) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const AgentModal: React.FC<AgentModalProps> = ({ open, form, error, editingId, modelOptions, onChange, onClose, onSubmit }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">{editingId ? 'Edit Agent' : 'Register Agent'}</h2>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>
            ✕
          </button>
        </div>
        {error && <p className="text-red-600 mb-3 text-sm">{error}</p>}
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Name (unique)</label>
            <input
              className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Display Name</label>
            <input
              className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={form.displayName}
              onChange={(e) => onChange({ ...form, displayName: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              rows={2}
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Capabilities (comma separated)</label>
            <input
              className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={form.capabilities}
              onChange={(e) => onChange({ ...form, capabilities: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Models (comma separated)</label>
            <input
              className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={form.models}
              onChange={(e) => onChange({ ...form, models: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Preferred model (optional)</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {modelOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`px-3 py-1 rounded-full border text-sm ${
                    form.preferredModel === opt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-800 border-gray-300 hover:border-blue-400'
                  }`}
                  onClick={() => onChange({ ...form, preferredModel: opt })}
                >
                  {opt}
                </button>
              ))}
              <input
                list="modelOptionsList"
                className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Type to search or enter a model"
                value={form.preferredModel}
                onChange={(e) => onChange({ ...form, preferredModel: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3">
            <button type="button" className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700">
              {editingId ? 'Save Changes' : 'Register Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AgentModal;
