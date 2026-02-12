import React from 'react';
import type { Agent } from './types';

interface AgentListProps {
  agents: Agent[];
  onEdit: (agent: Agent) => void;
  onDelete: (id: string) => void;
}

const AgentList: React.FC<AgentListProps> = ({ agents, onEdit, onDelete }) => {
  if (agents.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-500">
        No agents found for this search.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {agents.map((agent) => (
        <div key={agent.id} className="border-l-4 border-gray-200 pl-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{agent.displayName}</h3>
              <p className="text-sm text-gray-600">{agent.description}</p>
              <div className="flex items-center mt-2 space-x-2">
                <span className="px-2 py-1 rounded-full text-xs bg-blue-200 text-blue-800">{agent.status}</span>
                <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-800">{agent.models.length} models</span>
              </div>
            </div>
            <div className="text-right space-y-2">
              <p className="text-sm text-gray-500">{new Date(agent.createdAt).toLocaleDateString()}</p>
              <div className="flex space-x-2 justify-end">
                <button className="text-blue-600 hover:text-blue-800 text-sm" onClick={() => onEdit(agent)}>
                  Edit
                </button>
                <button className="text-red-600 hover:text-red-800 text-sm" onClick={() => onDelete(agent.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AgentList;
