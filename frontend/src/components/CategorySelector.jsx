export default function CategorySelector({ options = [], value = [], onChange, disabled = false }) {
  const toggleCategory = (name) => {
    if (disabled) return;
    const next = value.includes(name)
      ? value.filter((c) => c !== name)
      : [...value, name];
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {options.map((cat) => {
        const checked = value.includes(cat.name);
        return (
          <label
            key={cat.name}
            className={`
              flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm
              ${checked
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}
              ${disabled ? 'cursor-not-allowed opacity-60' : ''}
            `}
          >
            <input
              type="checkbox"
              className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={checked}
              disabled={disabled}
              onChange={() => toggleCategory(cat.name)}
            />
            {cat.label}
          </label>
        );
      })}
    </div>
  );
}
