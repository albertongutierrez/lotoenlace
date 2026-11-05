export function clearTariffOverride(
    settings: Record<string, any>,
    section: 'general_rules' | 'rules' | 'super_pale' | 'pairs',
    key?: string,
): Record<string, any> {
    const next = { ...settings };
    if (key === undefined) {
        delete next[section];
        return next;
    }

    const entries = { ...settings[section] };
    delete entries[key];
    if (Object.keys(entries).length > 0) next[section] = entries;
    else delete next[section];

    return next;
}
