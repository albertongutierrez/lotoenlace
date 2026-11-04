type Play = { draw_id: number; second_draw_id?: number; modality: string; numbers: string };
export function playIdentity(line: Play): string {
    const numbers = line.numbers.split("-");
    if (line.modality === "pale" || line.modality === "tripleta") numbers.sort();
    return [line.draw_id, line.second_draw_id ?? "", line.modality, numbers.join("-")].join(":");
}
export function newPlays<T extends Play>(existing: T[], candidates: T[]): T[] {
    const seen = new Set(existing.map(playIdentity));
    return candidates.filter(line => {
        const key = playIdentity(line);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
