export function parsePlay(value: string, preferredMode?: string) {
    const compact = value.trim().replace(/[\s-]/g, "").toLowerCase().replace(/\.$/, "");
    const special = /^s\d{4}$|^\d{4}s$/.test(compact);
    const digits = special ? compact.replace("s", "") : compact;
    if (!/^\d+$/.test(digits)) return null;
    const modality = special ? "super_pale" : digits.length <= 2 ? "quiniela"
        : digits.length === 4 ? (preferredMode === "super_pale" ? "super_pale" : "pale")
        : digits.length === 6 ? "tripleta" : null;
    if (!modality) return null;
    return { modality, numbers: digits.padStart(2, "0").match(/.{2}/g)!.join("-") };
}

export function parsePlayVariants(value: string, preferredMode?: string) {
    const original = parsePlay(value, preferredMode);
    if (!original) return [];
    if (!value.trim().endsWith(".")) return [original];

    // Reverse each two-digit number, keeping the positions of a súper palé.
    const reversed = { ...original, numbers: original.numbers.split("-").map(number => [...number].reverse().join("")).join("-") };
    const identity = (numbers: string) => original.modality === "pale" || original.modality === "tripleta" ? numbers.split("-").sort().join("-") : numbers;
    return identity(original.numbers) === identity(reversed.numbers) ? [original] : [original, reversed];
}
