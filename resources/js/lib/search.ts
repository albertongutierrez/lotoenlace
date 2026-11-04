export const normalizeSearch = (value: unknown) => String(value ?? '')

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .toLowerCase()

    .replace(/(\d)\s*x\s*(\d)/g, '$1 x $2')

    .replace(/[^a-z0-9]+/g, ' ')

    .replace(/\s+/g, ' ')

    .trim();

export const searchTokens = (value: unknown) => normalizeSearch(value).split(' ').filter(Boolean);

export const includesSearch = (value: unknown, query: string) => {

    const normalizedValue = normalizeSearch(value);

    const normalizedQuery = normalizeSearch(query);

    if (!normalizedQuery) {

        return true;

    }

    if (normalizedValue.includes(normalizedQuery)) {

        return true;

    }

    return searchTokens(normalizedQuery).every((token) => normalizedValue.includes(token));

};
