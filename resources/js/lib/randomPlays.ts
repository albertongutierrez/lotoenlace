import { playIdentity } from "./playIdentity";

export const randomModes = ["quiniela", "pale", "tripleta"] as const;
export type RandomMode = typeof randomModes[number];
export type RandomRequest = { modality: RandomMode; count: number; amount: string };
export type RandomPlay = { modality: RandomMode; numbers: string; amount: string };
type ExistingPlay = { draw_id: number; modality: string; numbers: string };
const capacities = { quiniela: 100, pale: 4950, tripleta: 161700 };
const names = { quiniela: "quinielas", pale: "palés", tripleta: "tripletas" };

function combinations(n: number, k: number): number {
    if (k === 0) return 1;
    if (k === 1) return n;
    return n * (n - 1) / 2;
}

// Decode a combination's position without allocating all 161,700 tripletas.
function numbersAt(rank: number, size: number): string {
    const result: string[] = [];
    let start = 0;
    for (let left = size; left > 0; left--) {
        for (let n = start; n <= 100 - left; n++) {
            const block = combinations(99 - n, left - 1);
            if (rank >= block) { rank -= block; continue; }
            result.push(String(n).padStart(2, "0"));
            start = n + 1;
            break;
        }
    }
    return result.join("-");
}

export function generateRandomPlays(requests: RandomRequest[], existing: ExistingPlay[], drawIds: number[], random: () => number = Math.random): RandomPlay[] {
    if (!drawIds.length) throw Error("Selecciona al menos un sorteo en ventas.");
    if (new Set(requests.map(request => request.modality)).size !== requests.length) throw Error("Indica una cantidad por modalidad.");
    const count = requests.reduce((sum, request) => sum + request.count, 0);
    for (const request of requests) {
        if (!randomModes.includes(request.modality) || !Number.isInteger(request.count) || request.count < 0 || request.count > 500) throw Error("Las cantidades deben ser enteros entre 0 y 500.");
        if (request.count && (!/^\d+(\.\d{1,2})?$/.test(request.amount) || Number(request.amount) <= 0 || !Number.isSafeInteger(Math.round(Number(request.amount) * 100)))) throw Error(`Indica un monto válido para ${names[request.modality]}.`);
    }
    if (!count) throw Error("Indica cuántas jugadas quieres generar.");
    if (existing.length + count * new Set(drawIds).size > 500) throw Error("Máximo 500 jugadas por ticket, contando todos los sorteos seleccionados.");

    const result: RandomPlay[] = [];
    for (const request of requests) {
        if (!request.count) continue;
        const identity = (numbers: string) => playIdentity({ draw_id: 0, modality: request.modality, numbers });
        const used = new Set(existing.filter(play => drawIds.includes(play.draw_id) && play.modality === request.modality).map(play => identity(play.numbers)));
        const capacity = capacities[request.modality];
        if (request.count > capacity - used.size) throw Error(`Solo quedan ${capacity - used.size} ${names[request.modality]} distintas disponibles para los sorteos seleccionados.`);
        const swaps = new Map<number, number>();
        let remaining = capacity;
        let generated = 0;
        while (generated < request.count && remaining > 0) {
            const value = random();
            if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error("No se pudieron generar los números. Intenta nuevamente.");
            const index = Math.floor(value * remaining);
            const rank = swaps.get(index) ?? index;
            remaining--;
            swaps.set(index, swaps.get(remaining) ?? remaining);
            swaps.delete(remaining);
            const numbers = numbersAt(rank, randomModes.indexOf(request.modality) + 1);
            if (used.has(identity(numbers))) continue;
            result.push({ modality: request.modality, numbers, amount: request.amount });
            generated++;
        }
    }
    return result;
}
