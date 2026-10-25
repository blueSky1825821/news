import React from 'react';

export default function SourceFilter({ sources, selectedId, onChange }) {
  return (
    <div className="w-full sm:w-48">
      <select
        value={selectedId || ''}
        onChange={(e) => onChange && onChange(e.target.value ? Number(e.target.value) : undefined)}
        className="block w-full rounded-md border-gray-300 bg-white py-2 pl-3 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">全部来源</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
