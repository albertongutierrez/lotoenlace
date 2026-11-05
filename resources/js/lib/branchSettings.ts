export function hasBranchOverrides(settings?: Record<string, any> | null): boolean {
    return Object.entries(settings ?? {}).some(([key, value]) => {
        if (value == null || key === 'consortium_limit_minor') return false;
        if (key === 'payment_reference_required') {
            return settings?.payment_methods != null && Object.keys(value).length > 0;
        }
        if (key === 'payment_method_labels') return Object.keys(value).length > 0;
        if (key === 'super_pale') {
            return Object.values(value).some(field => field != null);
        }
        if (key === 'general_rules' || key === 'rules' || key === 'pairs') {
            return Object.values(value).some(rule => rule != null && Object.values(rule).some(field => field != null));
        }
        return true;
    });
}
