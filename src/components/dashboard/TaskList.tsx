import React from 'react';
import type { Task } from './types';

interface TaskListProps {
  tasks: Task[];
  getStatusColor: (status: string) => string;
  getPriorityColor: (priority: string) => string;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onPlan: (task: Task) => void;
  onCodegen: (task: Task) => void;
}

const TaskList: React.FC<TaskListProps> = ({ tasks, getStatusColor, getPriorityColor, onEdit, onDelete, onPlan, onCodegen }) => {
  if (tasks.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-500">
        No tasks found for these filters.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <div key={task.id} className="border-l-4 border-gray-200 pl-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{task.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{task.description}</p>
              <div className="flex items-center mt-2 space-x-2">
                <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(task.status)}`}>{task.status}</span>
                <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(task.priority)}`}>{task.priority}</span>
              </div>
            </div>
            <div className="text-right space-y-2">
              <p className="text-sm text-gray-500">{new Date(task.createdAt).toLocaleDateString()}</p>
              <div className="flex space-x-2 justify-end">
                <button className="text-blue-600 hover:text-blue-800 text-sm" onClick={() => onEdit(task)}>
                  Edit
                </button>
                <button className="text-red-600 hover:text-red-800 text-sm" onClick={() => onDelete(task.id)}>
                  Delete
                </button>
                <button className="text-indigo-600 hover:text-indigo-800 text-sm" onClick={() => onPlan(task)}>
                  Plan
                </button>
                <button className="text-amber-600 hover:text-amber-800 text-sm" onClick={() => onCodegen(task)}>
                  Codegen
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaskList;
