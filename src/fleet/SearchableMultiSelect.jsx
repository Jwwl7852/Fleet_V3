import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./searchable-multi-select.css";

export default function SearchableMultiSelect({
  label,
  allLabel = "Alle",
  options = [],
  selected = [],
  onChange,
  singular = "valgt",
  plural = "valgte",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("da-DK");
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.searchText || ""}`.toLocaleLowerCase("da-DK").includes(needle));
  }, [options, query]);
  const summary = !selected.length
    ? allLabel
    : selected.length === 1
      ? options.find((option) => option.value === selected[0])?.label || `1 ${singular}`
      : `${selected.length} ${plural}`;

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = (value) => onChange(selectedSet.has(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value]);

  return <div className="service-multiselect" ref={rootRef}>
    <span className="service-multiselect-label">{label}</span>
    <button
      ref={triggerRef}
      className="service-multiselect-trigger"
      type="button"
      aria-expanded={open}
      aria-controls={listId}
      aria-haspopup="listbox"
      onClick={() => {
        if (open) setQuery("");
        setOpen((value) => !value);
      }}
    >
      <span>{summary}</span><span aria-hidden="true">⌄</span>
    </button>
    {open ? <div className="service-multiselect-popover">
      <label className="service-multiselect-search">
        <span className="sr-only">Søg i {label.toLocaleLowerCase("da-DK")}</span>
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Søg i ${label.toLocaleLowerCase("da-DK")} …`} />
      </label>
      <div className="service-multiselect-options" id={listId} role="listbox" aria-label={`${label} – flervalg`} aria-multiselectable="true">
        <label className="service-multiselect-option service-multiselect-all" role="option" aria-selected={!selected.length}>
          <input type="checkbox" checked={!selected.length} onChange={() => onChange([])} />
          <span>{allLabel}</span>
        </label>
        {filteredOptions.map((option) => <label className="service-multiselect-option" key={option.value} role="option" aria-selected={selectedSet.has(option.value)}>
          <input type="checkbox" checked={selectedSet.has(option.value)} disabled={option.disabled} onChange={() => toggle(option.value)} />
          <span>{option.label}</span>
        </label>)}
        {!filteredOptions.length ? <p className="service-multiselect-empty">Ingen valgmuligheder matcher søgningen.</p> : null}
      </div>
    </div> : null}
  </div>;
}
