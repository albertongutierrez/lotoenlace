// Shared by the browser receipt and the standalone print agent.
export const receiptModes = { quiniela: 'Quiniela', pale: 'Palé', tripleta: 'Tripleta', super_pale: 'Súper palé' };

export const receiptColumns = (paperWidth, textSize = 'normal') => textSize === 'small' ? (paperWidth === 58 ? 42 : 64) : (paperWidth === 58 ? 32 : 48);
export const receiptText = value => String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
export const receiptAmount = (minor, currency, compact = false) => `${currency === 'DOP' ? 'RD$' : receiptText(currency) + ' '}${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: compact && minor % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

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

/**
 * Pack only neighboring wagers of the same modality in an existing draw group.
 * Long values retain a full row, without clipping numbers or money.
 * @param {ReceiptLine[]} lines
 */
export function receiptWagerRows(lines, columns, currency, wagersPerRow = 1) {
  const cellWidth = Math.floor((columns - 3) / 2);
  const fits = line => receiptText(line.numbers).length + 1 + receiptAmount(line.amount_minor, currency, true).length <= cellWidth;
  /** @type {{modality: string, lines: ReceiptLine[], double: boolean}[]} */
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const double = wagersPerRow === 2 && fits(line);
    const row = { modality: line.modality, lines: [line], double };
    const next = lines[i + 1];
    if (double && next?.modality === line.modality && fits(next)) { row.lines.push(next); i++; }
    rows.push(row);
  }
  return rows;
}

/** @param {{lines: ReceiptLine[]}} row */
export function receiptDoubleRowText(row, columns, currency) {
  const cellWidth = Math.floor((columns - 3) / 2);
  const cell = line => {
    if (!line) return ' '.repeat(cellWidth);
    const left = receiptText(line.numbers), right = receiptAmount(line.amount_minor, currency, true);
    return left + ' '.repeat(Math.max(1, cellWidth - left.length - right.length)) + right;
  };
  return `${cell(row.lines[0])} | ${cell(row.lines[1])}`;
}
