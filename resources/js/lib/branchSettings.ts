export type BranchOverride = { path: string[]; value: any };

export function listBranchOverrides(settings?: Record<string, any> | null): BranchOverride[] {
    const overrides: BranchOverride[] = [];
    for (const [key, value] of Object.entries(settings ?? {})) {
        if (value == null || key === 'consortium_limit_minor' || key === 'payment_reference_required') continue;
        if (key === 'payment_method_labels' && (settings?.payment_methods != null || Object.keys(value).length === 0)) continue;
        if (key === 'super_pale') {
            for (const [field, own] of Object.entries(value)) {
                if (own != null) overrides.push({ path: [key, field], value: own });
            }
        } else if (key === 'general_rules' || key === 'rules' || key === 'pairs') {
            for (const [ruleKey, rule] of Object.entries(value)) {
                for (const [field, own] of Object.entries(rule ?? {})) {
                    if (own != null) overrides.push({ path: [key, ruleKey, field], value: own });
                }
            }
        } else overrides.push({ path: [key], value });
    }
    return overrides;
}

export function hasBranchOverrides(settings?: Record<string, any> | null): boolean {
    return listBranchOverrides(settings).length > 0;
}

export function removeBranchOverride(settings: Record<string, any>, path: string[]): Record<string, any> {
    const [key, ...remaining] = path;
    const next = { ...settings };
    if (remaining.length > 0) {
        const child = removeBranchOverride(settings[key] ?? {}, remaining);
        if (Object.keys(child).length > 0) next[key] = child;
        else delete next[key];
    } else {
        delete next[key];
        if (key === 'payment_methods') {
            delete next.payment_method_labels;
            delete next.payment_reference_required;
        }
    }
    return next;
}

export function inheritedBranchValue(settings: Record<string, any>, parent: Record<string, any>, path: string[]): any {
    const [section, key, field] = path;
    if (path.length === 1) return parent[section];
    if (section === 'super_pale') return parent.super_pale?.[key];
    if (section === 'general_rules') return parent.general_rules?.[key]?.[field];

    const mode = key.split(':')[1];
    const rules = section === 'pairs'
        ? [parent.super_pale, parent.pairs?.[key], settings.super_pale]
        : [parent.general_rules?.[mode], parent.rules?.[key], settings.general_rules?.[mode]];
    let inherited;
    for (const rule of rules) {
        if (rule?.[field] != null) inherited = rule[field];
    }
    if (section === 'pairs' && field === 'enabled' && !(parent.pairs?.[key]?.enabled ?? parent.super_pale?.enabled ?? false)) return false;
    return inherited;
}
