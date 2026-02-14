import React from 'react';
import type { AgentForm } from './types';

interface AgentModalProps {
  editingAgentId: string | null;
  errors: Record<string, string>;
  agentForm: AgentForm;
  setAgentForm: React.Dispatch<React.SetStateAction<AgentForm>>;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onClose: () => void;
  isSubmitting?: boolean;
}

const AgentModal: React.FC<AgentModalProps> = ({
  editingAgentId,
  errors,
  agentForm,
  setAgentForm,
  onSubmit,
  onClose,
  isSubmitting = false,
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">{editingAgentId ? 'Edit Agent' : 'Register Agent'}</h2>
        <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>
          ✕
        </button>
      </div>
      {errors.global && <p className="text-red-600 mb-3 text-sm">{errors.global}</p>}
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="block text-sm font-medium text-gray-700">Name (unique)</label>
          <input
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            value={agentForm.name}
            onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
            required
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Display Name</label>
          <input
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            value={agentForm.displayName}
            onChange={(e) => setAgentForm({ ...agentForm, displayName: e.target.value })}
            required
          />
          {errors.displayName && <p className="text-red-500 text-xs mt-1">{errors.displayName}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            rows={2}
            value={agentForm.description}
            onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Capabilities (comma separated)</label>
          <input
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            value={agentForm.capabilities}
            onChange={(e) => setAgentForm({ ...agentForm, capabilities: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Models (comma separated)</label>
          <input
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            value={agentForm.models}
            onChange={(e) => setAgentForm({ ...agentForm, models: e.target.value })}
          />
        </div>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : (editingAgentId ? 'Save Changes' : 'Register Agent')}
          </button>
        </div>
      </form>
    </div>
  </div>
);

export default AgentModal;
