import './bootstrap';

import '../css/app.css';

import { createRoot } from 'react-dom/client';

import { createInertiaApp, router } from '@inertiajs/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, queryScope } from './lib/queryClient';

import { installContextualNavigation } from './lib/contextualNavigation';

const pages = import.meta.glob<{ default: import('react').ComponentType }>('./Pages/**/*.tsx');

const appName = import.meta.env.VITE_APP_NAME || 'Mi Proyecto';

const theme = localStorage.getItem('theme');

document.documentElement.classList.toggle('dark', theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);

window.addEventListener('vite:preloadError', () => {

    const key = 'base.asset-reload';

    if (Date.now() - Number(sessionStorage.getItem(key) || 0) < 10000) return;

    sessionStorage.setItem(key, String(Date.now()));

    window.location.reload();

});

createInertiaApp({

    title: title => `${title} - ${appName}`,

    resolve: name => {

        const load = pages[`./Pages/${name}.tsx`];

        if (!load) throw new Error(`Pagina no encontrada: ${name}`);

        return load().then(module => module.default);

    },

    setup({ el, App, props }) {

        installContextualNavigation(props.initialPage);

        let scope = queryScope(props.initialPage);
        router.on('navigate', ({ detail }) => {
            const nextScope = queryScope(detail.page);
            if (nextScope !== scope) {
                queryClient.clear();
                scope = nextScope;
            }
        });

        if (el) createRoot(el).render(<QueryClientProvider client={queryClient}><App {...props} /></QueryClientProvider>);

    },

    progress: { color: '#059669' },

});
