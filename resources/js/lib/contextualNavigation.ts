import { router } from '@inertiajs/react';

import type { Page } from '@inertiajs/core';

import { advanceNavigation, localNavigationUrl, previousNavigationUrl, restoreNavigation, type NavigationTrail } from './contextualNavigationState';

const storageKey = 'base.navigation-trail';

let trail: NavigationTrail = { scope: '', entries: [] };

let installed = false;

const listeners = new Set<() => void>();

export const subscribeNavigation = (listener: () => void) => {

    listeners.add(listener);

    return () => { listeners.delete(listener); };

};

export const returnDestination = (currentUrl: string, fallback: string) => {

    const current = localNavigationUrl(currentUrl, window.location.origin);

    return current ? previousNavigationUrl(trail, current) ?? fallback : fallback;

};

export function installContextualNavigation(initialPage: Page) {

    if (installed) return;

    installed = true;

    const origin = window.location.origin;

    const scopeFor = (page: Page) => {

        const auth = page.props.auth as { user?: { id: number }; activeBranchOffice?: { id: number } } | undefined;

        return auth?.user?.id ? `${auth.user.id}:${auth.activeBranchOffice?.id ?? ''}` : '';

    };

    const entryFor = (page: Page) => ({ url: localNavigationUrl(page.url, origin) ?? window.location.pathname, component: page.component });

    const publish = () => {

        try { window.sessionStorage.setItem(storageKey, JSON.stringify(trail)); } catch { /* Navigation still works without storage. */ }

        listeners.forEach(listener => listener());

    };

    let stored: unknown = null;

    try { stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null'); } catch { /* Ignore invalid saved navigation. */ }

    trail = restoreNavigation(stored, entryFor(initialPage), scopeFor(initialPage), origin);

    publish();

    let menuClick: { url: string; at: number } | null = null;

    let pending: { menu: boolean; method: string } | undefined;

    let historyTarget: string | null = null;

    document.addEventListener('click', (event) => {

        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const anchor = event.target instanceof Element ? event.target.closest('a') : null;

        if (!anchor || anchor.target === '_blank' || !anchor.closest('[data-navigation-menu]')) return;

        const url = localNavigationUrl(anchor.href, origin);

        if (url) menuClick = { url, at: Date.now() };

    }, true);

    router.on('before', (event) => {

        historyTarget = null;

        const url = localNavigationUrl(event.detail.visit.url.href, origin);

        pending = { method: event.detail.visit.method, menu: Boolean(menuClick && menuClick.url === url && Date.now() - menuClick.at < 1000) };

        menuClick = null;

    });

    const record = (page: Page) => {

        if (historyTarget && localNavigationUrl(page.url, origin) !== historyTarget) return;

        trail = advanceNavigation(trail, entryFor(page), scopeFor(page), pending);

        publish();

    };

    router.on('navigate', (event) => {

        if (historyTarget && localNavigationUrl(event.detail.page.url, origin) !== historyTarget) return;

        record(event.detail.page);

        if (historyTarget) {

            // A pending Inertia scroll update can temporarily restore the old URL.

            const target = historyTarget;

            historyTarget = null;

            queueMicrotask(() => router.get(target, {}, { replace: true, preserveState: false, preserveScroll: true }));

        }

    });

    // Inertia uses replace visits for filters; those emit success, not navigate.

    router.on('success', (event) => record(event.detail.page));

    router.on('finish', () => { pending = undefined; });

    window.addEventListener('popstate', (event) => {

        pending = undefined;

        historyTarget = event.state?.component && event.state?.props && typeof event.state?.url === 'string'

            ? localNavigationUrl(event.state.url, origin) : null;

    }, true);

    window.addEventListener('pageshow', (event) => {

        if (event.persisted) router.get(window.location.href, {}, { replace: true, preserveState: false, preserveScroll: true });

    });

}
