import { useEffect, useState } from 'react';

function getInitialTheme(): 'light' | 'dark' {

    if (typeof window === 'undefined') {

        return 'light';

    }

    const storedTheme = localStorage.getItem('theme');

    if (storedTheme === 'light' || storedTheme === 'dark') {

        return storedTheme;

    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

}

function SunIcon() {

    return (

        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">

            <circle cx="12" cy="12" r="4" />

            <path d="M12 2v2" />

            <path d="M12 20v2" />

            <path d="m4.93 4.93 1.41 1.41" />

            <path d="m17.66 17.66 1.41 1.41" />

            <path d="M2 12h2" />

            <path d="M20 12h2" />

            <path d="m6.34 17.66-1.41 1.41" />

            <path d="m19.07 4.93-1.41 1.41" />

        </svg>

    );

}

function MoonIcon() {

    return (

        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">

            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />

        </svg>

    );

}

export default function ThemeToggle() {

    const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

    useEffect(() => {

        document.documentElement.classList.toggle('dark', theme === 'dark');

        localStorage.setItem('theme', theme);

    }, [theme]);

    const isDark = theme === 'dark';

    return (

        <button

            type="button"

            onClick={() => setTheme(isDark ? 'light' : 'dark')}

            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"

            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}

            title={isDark ? 'Modo claro' : 'Modo oscuro'}

        >

            {isDark ? <SunIcon /> : <MoonIcon />}

        </button>

    );

}