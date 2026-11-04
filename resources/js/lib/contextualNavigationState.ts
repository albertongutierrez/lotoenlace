export type NavigationEntry = { url: string; component: string };

export type NavigationTrail = { scope: string; entries: NavigationEntry[] };

export function localNavigationUrl(value: string, origin: string): string | null {

    try {

        const url = new URL(value, origin);

        if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return null;

        return url.pathname + url.search + url.hash;

    } catch {

        return null;

    }

}

const sameScreen = (left: NavigationEntry, right: NavigationEntry) => left.component === right.component

    && left.url.split(/[?#]/)[0] === right.url.split(/[?#]/)[0];

export function advanceNavigation(trail: NavigationTrail, entry: NavigationEntry, scope: string, options: { menu?: boolean; method?: string } = {}): NavigationTrail {

    if (!scope) return { scope: '', entries: [] };

    if (trail.scope !== scope || options.menu) return { scope, entries: [entry] };

    let entries = [...trail.entries];

    const current = entries[entries.length - 1];

    if (current && sameScreen(current, entry)) {

        entries[entries.length - 1] = entry;

        return { scope, entries };

    }

    // A saved form should not become the return destination of its new document.

    if (current && options.method && options.method.toLowerCase() !== 'get' && /\/(Create|Edit)$/.test(current.component)) {

        entries.pop();

    }

    const previous = entries.findIndex(candidate => sameScreen(candidate, entry));

    entries = previous >= 0 ? [...entries.slice(0, previous), entry] : [...entries, entry];

    return { scope, entries: entries.slice(-30) };

}

export function restoreNavigation(value: unknown, entry: NavigationEntry, scope: string, origin: string): NavigationTrail {

    const fresh = { scope, entries: scope ? [entry] : [] };

    if (!value || typeof value !== 'object') return fresh;

    const stored = value as NavigationTrail;

    if (stored.scope !== scope || !Array.isArray(stored.entries)) return fresh;

    const entries = stored.entries.filter(candidate => candidate && typeof candidate.component === 'string'

        && typeof candidate.url === 'string' && localNavigationUrl(candidate.url, origin) === candidate.url).slice(-30);

    const current = entries[entries.length - 1];

    return current && sameScreen(current, entry) ? advanceNavigation({ scope, entries }, entry, scope) : fresh;

}

export function previousNavigationUrl(trail: NavigationTrail, currentUrl: string): string | null {

    const current = trail.entries[trail.entries.length - 1];

    return current && current.url === currentUrl ? trail.entries[trail.entries.length - 2]?.url ?? null : null;

}
