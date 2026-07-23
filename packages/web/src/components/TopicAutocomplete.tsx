import { useEffect, useRef, useState } from "react";

export interface TopicAutocompleteProps {
  value: string;
  topics: string[];
  label: string;
  onChange: (value: string) => void;
}

export function TopicAutocomplete({
  value,
  topics,
  label,
  onChange,
}: TopicAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentPart = value.split(",").pop()?.trim() ?? "";
  const suggestions = topics.filter((topic) =>
    topic.toLowerCase().includes(currentPart.toLowerCase()),
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const selectTopic = (topic: string) => {
    const parts = value.split(",");
    parts[parts.length - 1] = ` ${topic}`;
    onChange(parts.join(",").replace(/^\s+/, ""));
    setOpen(false);
  };

  return (
    <div
      className={`topic-autocomplete ${value.trim() ? "has-value" : ""}`}
      ref={rootRef}
    >
      <span className="topic-floating-label">{label}</span>
      <input
        aria-label={label}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {open && suggestions.length > 0 && (
        <div className="topic-suggestion-list" role="listbox">
          {suggestions.map((topic) => (
            <button
              key={topic}
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectTopic(topic)}
            >
              {topic}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
