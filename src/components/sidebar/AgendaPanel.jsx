import React, { useState } from 'react';
import { Check, Circle, ListChecks, Plus, Trash2 } from 'lucide-react';

function createAgendaId() {
  return globalThis.crypto?.randomUUID?.() || `agenda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AgendaPanel({ agenda = [], onChange, isHost = false }) {
  const [newItem, setNewItem] = useState('');
  const completedCount = agenda.filter((item) => item.isCompleted).length;

  const updateItem = (id, changes) => {
    onChange(agenda.map((item) => item.id === id ? { ...item, ...changes } : item));
  };

  const addItem = (event) => {
    event.preventDefault();
    const text = newItem.trim();
    if (!text || agenda.length >= 20) return;
    onChange([...agenda, { id: createAgendaId(), text, isCompleted: false }]);
    setNewItem('');
  };

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[#fbfbf8]">
      <header className="flex items-center justify-between border-b border-[#ecece7] bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[#8aa767]" />
          <h2 className="text-xs font-bold text-[#32342e]">Meeting agenda</h2>
        </div>
        <span className="text-[10px] text-[#85877f]">{completedCount}/{agenda.length} done</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {agenda.length ? agenda.map((item, index) => (
          <article key={item.id} className="flex items-start gap-2 rounded-xl border border-[#ecece7] bg-white p-2.5">
            <button
              type="button"
              onClick={() => updateItem(item.id, { isCompleted: !item.isCompleted })}
              aria-label={`${item.isCompleted ? 'Mark incomplete' : 'Mark complete'}: ${item.text}`}
              aria-pressed={Boolean(item.isCompleted)}
              className="mt-0.5 shrink-0 rounded text-[#8aa767] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]"
            >
              {item.isCompleted ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </button>
            <p className={`min-w-0 flex-1 text-xs leading-relaxed ${item.isCompleted ? 'text-[#92948d] line-through' : 'text-[#50534b]'}`}>
              <span className="mr-1.5 text-[10px] font-semibold text-[#9b7863]">{index + 1}.</span>{item.text}
            </p>
            {isHost && (
              <button type="button" aria-label={`Remove agenda item ${index + 1}`} onClick={() => onChange(agenda.filter((entry) => entry.id !== item.id))} className="shrink-0 rounded p-1 text-[#a1a39c] hover:bg-[#fae8e4] hover:text-[#a85f51]">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </article>
        )) : (
          <p className="rounded-xl border border-dashed border-[#dfe1d9] px-4 py-8 text-center text-xs text-[#85877f]">No agenda items have been added yet.</p>
        )}
      </div>
      {isHost && (
        <form onSubmit={addItem} className="flex gap-2 border-t border-[#ecece7] bg-white p-3">
          <input value={newItem} onChange={(event) => setNewItem(event.target.value)} maxLength={300} placeholder="Add an agenda item" className="min-w-0 flex-1 rounded-xl border border-[#e8e9e3] bg-[#f7f8f5] px-3 py-2 text-xs outline-none focus:border-[#9bbc6d]" />
          <button type="submit" disabled={!newItem.trim() || agenda.length >= 20} className="flex items-center gap-1 rounded-xl bg-[#171815] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Add</button>
        </form>
      )}
    </section>
  );
}
