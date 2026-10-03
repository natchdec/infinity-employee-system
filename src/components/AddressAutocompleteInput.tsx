'use client';

import { useEffect, useRef, useState } from 'react';

export function AddressAutocompleteInput({
  csrf,
  name,
  defaultValue = '',
  required = false,
  placeholder,
  disabled = false,
}: {
  csrf: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<
    { placeId: string; text: string; mainText: string; secondaryText: string }[]
  >([]);
  const [available, setAvailable] = useState(true);
  const requestSequence = useRef(0);

  useEffect(() => {
    const input = query.trim();
    if (!available || input.length < 3) return;
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/places/autocomplete', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-csrf-token': csrf,
              'idempotency-key': crypto.randomUUID(),
            },
            body: JSON.stringify({ input }),
          });
          const result = await response.json();
          if (sequence !== requestSequence.current) return;
          if (!response.ok) {
            if (
              result?.error?.code === 'GOOGLE_PLACES_NOT_ENABLED' ||
              result?.error?.code === 'GOOGLE_PLACES_NOT_CONFIGURED'
            ) {
              setAvailable(false);
              setSuggestions([]);
              return;
            }
            setSuggestions([]);
            return;
          }
          setSuggestions(Array.isArray(result?.suggestions) ? result.suggestions.slice(0, 6) : []);
        } catch {
          if (sequence === requestSequence.current) setSuggestions([]);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [available, csrf, query]);

  return (
    <div className="address-autocomplete">
      <input
        name={name}
        required={required}
        disabled={disabled}
        autoComplete="off"
        ref={inputRef}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onInput={(event) => {
          const value = event.currentTarget.value;
          setQuery(value);
          setAvailable(true);
          if (value.trim().length < 3) {
            requestSequence.current += 1;
            setSuggestions([]);
          }
        }}
        onBlur={() => window.setTimeout(() => setSuggestions([]), 150)}
      />
      {suggestions.length ? (
        <div className="address-suggestions" role="listbox" aria-label="คำแนะนำสถานที่จาก Google">
          {suggestions.map((item) => (
            <button
              key={item.placeId}
              type="button"
              className="address-suggestion"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (inputRef.current) inputRef.current.value = item.text;
                setQuery(item.text);
                setSuggestions([]);
              }}
            >
              <strong>{item.mainText}</strong>
              {item.secondaryText ? <span>{item.secondaryText}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
