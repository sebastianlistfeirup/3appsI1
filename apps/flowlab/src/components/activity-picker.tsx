"use client";
import { useId } from "react";
/** Keep native keyboard behavior without rendering an unbounded option list for large logs. */
export function ActivityPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const matches = (
    value
      ? options.filter((option) =>
          option
            .toLocaleLowerCase("da-DK")
            .includes(value.toLocaleLowerCase("da-DK")),
        )
      : options
  ).slice(0, 200);
  return (
    <label>
      {label}
      <input
        list={id}
        value={value}
        maxLength={100}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Vælg eller skriv aktivitetens navn…"
      />
      <datalist id={id}>
        {matches.map((option) => (
          <option value={option} key={option} />
        ))}
      </datalist>
      {options.length > 200 && (
        <span className="field-hint">
          {options.length} aktiviteter. Skriv for at afgrænse de viste forslag;
          navnet skal matche data præcist.
        </span>
      )}
    </label>
  );
}
