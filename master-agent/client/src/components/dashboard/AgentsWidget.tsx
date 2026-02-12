import React from 'react';
import type { Agent } from './types';

interface AgentsWidgetProps {
  filteredAgents: Agent[];
  openAgentModalForEdit: (agent: Agent) => void;
  deleteAgent: (id: string) => void;
}

const AgentsWidget: React.FC<AgentsWidgetProps> = ({
  filteredAgents,
  openAgentModalForEdit,
  deleteAgent,
}) => (
  <div className="space-y-4">
    {filteredAgents.length === 0 && (
      <div className="border border-dashed border-slate-700 rounded-lg p-4 text-center text-slate-400 bg-slate-900/40">
        No agents for this search. Clear search or register a new agent.
      </div>
    )}
    {filteredAgents.map((agent: Agent) => (
      <div
        key={agent.id}
        className="border-l-4 border-gray-200 pl-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">{agent.displayName}</h3>
            <p className="text-sm text-gray-600">{agent.description}</p>
            <div className="flex items-center mt-2 space-x-2">
              <span className="px-2 py-1 rounded-full text-xs bg-blue-200 text-blue-800">
                {agent.status}
              </span>
              <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-800">
                {agent.models.length} models
              </span>
            </div>
          </div>
          <div className="text-right space-y-2">
            <p className="text-sm text-gray-500">
              {new Date(agent.createdAt).toLocaleDateString()}
            </p>
            <div className="flex space-x-2 justify-end">
              <button
                type="button"
                className="text-blue-600 hover:text-blue-800 text-sm"
                onClick={() => openAgentModalForEdit(agent)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-red-600 hover:text-red-800 text-sm"
                onClick={() => deleteAgent(agent.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default AgentsWidget;
