// Shared by the browser receipt and the standalone print agent.
export const receiptModes = { quiniela: 'Quiniela', pale: 'Palé', tripleta: 'Tripleta', super_pale: 'Súper palé' };

/** @typedef {{draw: string, draw_id?: number, second_draw_id?: number|null, modality: string, numbers: string, amount_minor: number}} ReceiptLine */
/**
 * Each wager is printed once for the exact set of draws to which it belongs.
 * Amounts and modalities are part of the identity; overlapping sets stay separate.
 * @param {ReceiptLine[]} lines
 */
export function groupReceiptLines(lines) {
  /** @type {Map<string, {key: string, name: string}>} */
  const draws = new Map();
  /** @type {Map<string, {line: ReceiptLine, draws: Set<string>}[]>} */
  const wagers = new Map();
  for (const line of lines) {
    const key = line.draw_id != null ? JSON.stringify([line.draw_id, line.second_draw_id ?? null]) : line.draw;
    if (!draws.has(key)) draws.set(key, { key, name: line.draw });
    const signature = JSON.stringify([line.modality, line.numbers, line.amount_minor]);
    const occurrences = wagers.get(signature) ?? [];
    // Preserve duplicate source rows rather than silently dropping their value.
    let occurrence = occurrences.find(item => !item.draws.has(key));
    if (!occurrence) { occurrence = { line, draws: new Set() }; occurrences.push(occurrence); }
    occurrence.draws.add(key);
    wagers.set(signature, occurrences);
  }
  /** @type {Map<string, {draws: {key: string, name: string}[], lines: ReceiptLine[]}>} */
  const groups = new Map();
  for (const occurrences of wagers.values()) for (const item of occurrences) {
    const key = JSON.stringify([...item.draws].sort());
    let group = groups.get(key);
    if (!group) { group = { draws: [...draws.values()].filter(draw => item.draws.has(draw.key)), lines: [] }; groups.set(key, group); }
    group.lines.push(item.line);
  }
  const order = Object.keys(receiptModes);
  for (const group of groups.values()) group.lines.sort((a, b) => order.indexOf(a.modality) - order.indexOf(b.modality));
  return [...groups.values()];
}
