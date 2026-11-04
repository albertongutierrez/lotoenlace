import thermal from 'node-thermal-printer';
import QRCode from 'qrcode';
import { groupReceiptLines, receiptModes } from './receipt-layout.mjs';
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = thermal;
const text = value => String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
const amount = (minor, currency) => `${currency === 'DOP' ? 'RD$' : text(currency) + ' '}${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export async function renderReceipt(job) {
  const { receipt: r, target } = job;
  const payout = r?.document_type === 'payout';
  const continuation = r?.document_type === 'continuation';
  if (!r || !Array.isArray(r.lines) || !r.lines.length || r.lines.length > 500 || (!payout && !/^[0-9]{6}$/.test(r.pin))) throw new Error('Comprobante inválido.');
  if (payout && (!r.payment_reference || !Number.isSafeInteger(r.net_minor) || r.net_minor <= 0 || r.net_minor !== r.lines.reduce((sum, line) => sum + line.amount_minor, 0))) throw new Error('Pago inválido.');
  if (![58, 80].includes(target.paper_width) || !['epson', 'star'].includes(target.profile)) throw new Error('Perfil de impresión inválido.');
  const feedLines = target.feed_lines ?? 2;
  if (!Number.isInteger(feedLines) || feedLines < 0 || feedLines > 15) throw new Error('Espacio final inválido.');
  const p = new ThermalPrinter({ type: target.profile === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON, width: target.paper_width === 58 ? 32 : 48, characterSet: CharacterSet.PC850_MULTILINGUAL, breakLine: BreakLine.WORD, removeSpecialCharacters: false });
  p.alignCenter(); p.bold(true);
  if (r.company_name) { p.setTextDoubleHeight(); p.println(text(r.company_name)); p.setTextNormal(); }
  p.println(`Banca: ${text(r.branch_name || r.branch)}`); p.bold(false); p.println(text(r.date));
  if (r.test_reprint) { p.bold(true); p.println('PRUEBA - SIN VALIDEZ'); p.bold(false); }
  if (r.status === 'cancelled') { p.bold(true); p.println('TICKET ANULADO'); p.bold(false); }
  p.bold(true);
  if (payout) { p.println('COMPROBANTE DE PAGO'); p.println(`Pago: ${text(r.payment_reference)}`); }
  if (continuation) { p.println('TICKET DE CONTINUACION'); p.println('SORTEOS PENDIENTES'); p.println(`Pago: ${text(r.payment_reference)}`); }
  p.println(`Ticket: ${text(r.reference)}`);
  if (!payout) p.println(`PIN de cobro: ${r.pin}`);
  p.bold(false);
  if (payout) { p.println(`Pagado por: ${text(r.paid_by)}`); p.println('PREMIOS PAGADOS'); }
  p.newLine();
  for (const l of r.lines) {
    if (!Number.isSafeInteger(l.amount_minor) || l.amount_minor <= 0) throw new Error('Monto inválido.');
    if (!Object.hasOwn(receiptModes, l.modality)) throw new Error('Modalidad inválida.');
  }
  for (const group of groupReceiptLines(r.lines)) {
    p.alignLeft();
    for (const draw of group.draws) { p.bold(true); p.println(text(draw.name)); p.bold(false); p.drawLine(); }
    let modality;
    for (const line of group.lines) {
      if (modality !== line.modality) {
        modality = line.modality; p.alignCenter(); p.bold(true); p.println(receiptModes[modality]); p.bold(false); p.alignLeft();
      }
      p.leftRight(text(line.numbers), amount(line.amount_minor, r.currency));
    }
  }
  p.drawLine();
  if (r.discount_minor > 0) p.leftRight('Descuento', amount(r.discount_minor, r.currency));
  p.bold(true); p.leftRight(payout ? 'TOTAL PAGADO' : continuation ? 'TOTAL PENDIENTE' : 'TOTAL', amount(r.net_minor, r.currency)); p.bold(false);
  if (!payout && !continuation && r.payment_method) p.println(`Cobro: ${text(r.payment_method_label || { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', deposit: 'Deposito' }[r.payment_method] || r.payment_method)}`);
  if (continuation) p.leftRight('Premio pagado', amount(r.paid_minor, r.currency));
  if ((!r.payment_method || r.payment_method === 'cash') && r.received_minor != null) p.leftRight('Recibido', amount(r.received_minor, r.currency));
  if (r.change_minor > 0) p.leftRight('Devolución', amount(r.change_minor, r.currency));
  p.newLine(); p.alignCenter();
  // Raster avoids QR-model command bytes appearing as text on compatible clones.
  if (r.show_qr) {
    const png = await QRCode.toBuffer(text(r.code), { type: 'png', errorCorrectionLevel: 'M', margin: 4, scale: target.paper_width === 58 ? 4 : 5 });
    await p.printImageBuffer(png); p.newLine();
  }
  if (r.footer) p.println(text(r.footer));
  if (continuation) { p.println('PIN anterior invalidado'); p.println('NO ES UNA NUEVA VENTA'); }
  p.println(`${r.kind === 'original' ? 'ORIGINAL' : 'REIMPRESIÓN'} · Copia ${r.sequence}`); p.println(`Control ${job.audit_number}`);
  for (let i = 0; i < feedLines; i++) p.newLine();
  if (target.cut) p.cut({ verticalTabAmount: 0 });
  return p.getBuffer();
}
