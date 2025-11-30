import React, { useState, useEffect } from 'react';
import { Task } from '../types';

interface TaskListProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, setTasks }) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle,
      status: 'todo'
    };
    
    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
  };

  const toggleStatus = (id: string) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        const nextStatus = t.status === 'todo' ? 'in-progress' : t.status === 'in-progress' ? 'done' : 'todo';
        return { ...t, status: nextStatus };
      }
      return t;
    }));
  };

  const removeTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const getStatusColor = (status: Task['status']) => {
    switch(status) {
      case 'todo': return 'bg-slate-700 border-slate-600 text-slate-300';
      case 'in-progress': return 'bg-amber-900/40 border-amber-700 text-amber-200';
      case 'done': return 'bg-emerald-900/40 border-emerald-700 text-emerald-200 line-through decoration-emerald-500';
    }
  };

  return (
    <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 flex flex-col h-full max-h-[400px]">
      <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        Missões do Dia
      </h3>
      
      <form onSubmit={addTask} className="mb-4 flex gap-2">
        <input 
          type="text" 
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Nova tarefa..."
          className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
        />
        <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white p-2 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </button>
      </form>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {tasks.length === 0 && <p className="text-slate-500 text-center text-sm py-4">Tudo limpo por aqui.</p>}
        {tasks.map(task => (
          <div 
            key={task.id} 
            className={`p-3 rounded-lg border flex items-center justify-between group cursor-pointer transition-all ${getStatusColor(task.status)}`}
            onClick={() => toggleStatus(task.id)}
          >
            <span className="text-sm font-medium truncate">{task.title}</span>
            <button 
              onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 p-1 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
