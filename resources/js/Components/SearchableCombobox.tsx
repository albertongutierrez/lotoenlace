import { includesSearch, normalizeSearch } from '@/lib/search';

import { Check, ChevronsUpDown, Search, X } from 'lucide-react';

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

export type ComboboxOption = {

    value: string;

    label: string;

    description?: string | null;

    searchText?: string;

};

type Props = {

    value: string;

    options: ComboboxOption[];

    placeholder: string;

    searchPlaceholder?: string;

    emptyText?: string;

    clearTitle?: string;

    className?: string;

    buttonClassName?: string;

    disabled?: boolean;

    disabledValues?: Set<string>;

    onBlur?: () => void;

    onSearchChange?: (query: string) => void;

    onChange: (value: string) => void;

};

export default function SearchableCombobox({

    value,

    options,

    placeholder,

    searchPlaceholder = 'Buscar...',

    emptyText = 'No hay resultados.',

    clearTitle = 'Limpiar',

    className = 'relative mt-2',

    buttonClassName = 'min-h-11 text-sm',

    disabled = false,

    disabledValues,

    onBlur,

    onSearchChange,

    onChange,

}: Props) {

    const selectedOption = options.find((option) => option.value === value) ?? null;

    const [open, setOpen] = useState(false);

    const [query, setQuery] = useState('');

    const [activeIndex, setActiveIndex] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);

    const buttonRef = useRef<HTMLButtonElement>(null);

    const listRef = useRef<HTMLDivElement>(null);

    const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const filteredOptions = useMemo(() => {

        const term = normalizeSearch(query);

        if (!term) {

            return options;

        }

        return options.filter((option) => includesSearch(`${option.label} ${option.description ?? ''} ${option.searchText ?? ''}`, term));

    }, [options, query]);

    const choose = (nextValue: string) => {

        onChange(nextValue);

        setQuery('');

        setOpen(false);

        requestAnimationFrame(() => buttonRef.current?.focus());

    };

    const openList = () => {

        const selectedIndex = Math.max(options.findIndex((option) => option.value === value), 0);

        setActiveIndex(selectedIndex);

        setOpen(true);

    };

    useEffect(() => {

        if (!open) {

            return;

        }

        const selectedIndex = filteredOptions.findIndex((option) => option.value === value);

        const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;

        setActiveIndex(nextIndex);

        requestAnimationFrame(() => inputRef.current?.focus());

    }, [open, value, filteredOptions.length]);

    useEffect(() => {

        if (!open) {

            return;

        }

        setActiveIndex((current) => Math.min(Math.max(current, 0), Math.max(filteredOptions.length - 1, 0)));

    }, [query, filteredOptions.length, open]);

    useEffect(() => {

        if (!open || filteredOptions.length === 0) {

            return;

        }

        const activeOption = filteredOptions[activeIndex];

        if (!activeOption) {

            return;

        }

        optionRefs.current[activeOption.value]?.scrollIntoView({ block: 'nearest' });

    }, [activeIndex, filteredOptions, open]);

    const handleKeyDown = (event: KeyboardEvent) => {

        if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {

            event.preventDefault();

            openList();

            return;

        }

        if (!open) {

            return;

        }

        if (event.key === 'ArrowDown') {

            event.preventDefault();

            setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));

        } else if (event.key === 'ArrowUp') {

            event.preventDefault();

            setActiveIndex((current) => Math.max(current - 1, 0));

        } else if (event.key === 'Home') {

            event.preventDefault();

            setActiveIndex(0);

        } else if (event.key === 'End') {

            event.preventDefault();

            setActiveIndex(Math.max(filteredOptions.length - 1, 0));

        } else if (event.key === 'Enter') {

            event.preventDefault();

            const activeOption = filteredOptions[activeIndex];

            if (activeOption && !disabledValues?.has(activeOption.value)) {

                choose(activeOption.value);

            }

        } else if (event.key === 'Escape') {

            event.preventDefault();

            setQuery('');

            onSearchChange?.('');

            setOpen(false);

        }

    };

    const handleClosedTypeAhead = (event: KeyboardEvent<HTMLButtonElement>) => {

        if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || event.key === ' ') {

            return;

        }

        event.preventDefault();

        setQuery(event.key);

        onSearchChange?.(event.key);

        setOpen(true);

    };

    const updateQuery = (event: ChangeEvent<HTMLInputElement>) => {

        const value = event.target.value;

        setQuery(value);

        onSearchChange?.(value);

        setActiveIndex(0);

    };

    return (

        <div

            className={className}

            onKeyDown={handleKeyDown}

        onBlur={(event) => {

            const nextTarget = event.relatedTarget as Node | null;

            if (!nextTarget || !event.currentTarget.contains(nextTarget)) {

                setOpen(false);

                onBlur?.();

            }

        }}

        >

            <button

                ref={buttonRef}

                type="button"

                onClick={() => (open ? setOpen(false) : openList())}

                onKeyDown={handleClosedTypeAhead}

                disabled={disabled}

                className={`flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-slate-700 shadow-sm hover:bg-slate-50 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 ${buttonClassName}`}

                aria-expanded={open}

            >

                <span className="min-w-0">

                    <span className="block truncate">{selectedOption?.label ?? placeholder}</span>

                    {selectedOption?.description && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{selectedOption.description}</span>}

                </span>

                <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />

            </button>

            {value && (

                <button

                    type="button"

                    onMouseDown={(event) => event.preventDefault()}

                    onClick={() => choose('')}

                    className="absolute right-9 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-100"

                    title={clearTitle}

                >

                    <X className="h-4 w-4" />

                </button>

            )}

            {open && (

                <div className="absolute left-0 right-0 z-[1500] mt-2 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">

                    <div className="relative border-b border-slate-200 p-2 dark:border-slate-800">

                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <input

                            ref={inputRef}

                            value={query}

                            onChange={updateQuery}

                            autoComplete="off"

                            placeholder={searchPlaceholder}

                            className="min-h-9 w-full rounded-md border-slate-300 bg-slate-50 pl-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"

                        />

                    </div>

                    <div ref={listRef} className="max-h-72 overflow-y-auto p-1">

                        {filteredOptions.length === 0 && <div className="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">{emptyText}</div>}

                        {filteredOptions.map((option, index) => {

                            const isSelected = option.value === value;

                            const isActive = index === activeIndex;

                            const isDisabled = disabledValues?.has(option.value) ?? false;

                            return (

                                <button

                                    key={option.value}

                                    ref={(element) => { optionRefs.current[option.value] = element; }}

                                    type="button"

                                    onMouseDown={(event) => event.preventDefault()}

                                    onMouseEnter={() => setActiveIndex(index)}

                                    onClick={() => !isDisabled && choose(option.value)}

                                    disabled={isDisabled}

                                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${isSelected || isActive ? 'bg-slate-950 text-white dark:bg-slate-800' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900'}`}

                                >

                                    <span className="min-w-0">

                                        <span className="block truncate font-semibold">{option.label}</span>

                                        {option.description && <span className={`block truncate text-xs ${isSelected || isActive ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>{option.description}</span>}

                                    </span>

                                    {isSelected && <Check className="h-4 w-4 shrink-0" />}

                                </button>

                            );

                        })}

                    </div>

                </div>

            )}

        </div>

    );

}
