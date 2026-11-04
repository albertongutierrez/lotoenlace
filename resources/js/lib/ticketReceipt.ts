import QRCode from 'qrcode';
import { ticketPaymentMethodName } from './paymentMethods';
import { groupReceiptLines, receiptModes } from '../../../printing-agent/src/receipt-layout.mjs';
import { PrinterPreference } from './localPrinter';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function ticketReceiptHtml(ticket: any, draws: { id: number; name: string }[], branch: { code: string; name?: string; office?: { name: string } }, currency: string, preference: PrinterPreference) {
    const payout = ticket.document_type === 'payout';
    const continuation = ticket.document_type === 'continuation';
    const cash = (value: number) => escapeHtml(`${(ticket.currency ?? currency) === 'DOP' ? 'RD$' : (ticket.currency ?? currency) + ' '}${(value / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    const company = ticket.print_settings?.company_name ?? branch.office?.name ?? '';
    const branchName = ticket.print_settings?.branch_name ?? branch.name ?? branch.code;
    const paymentLabel = !payout && !continuation ? `<p>Cobro: ${escapeHtml(ticketPaymentMethodName(ticket))}</p>` : '';
    const name = (id: number) => draws.find(draw => draw.id === id)?.name ?? String(id);
    const groups = groupReceiptLines((ticket.lines ?? []).map((line: any) => ({ ...line, draw: typeof line.draw === 'string' ? line.draw : (line.draw?.name ?? name(line.draw_id)) + (line.second_draw_id ? ' + ' + (line.second_draw?.name ?? name(line.second_draw_id)) : '') })));
    const rows = groups.map(group => {
        let modality = '';
        return group.draws.map(draw => `<div class="draw">${escapeHtml(draw.name)}</div>`).join('') + '<table><tbody>' + group.lines.map(line => {
            const heading = modality !== line.modality ? `<tr><th colspan="2">${escapeHtml(receiptModes[line.modality as keyof typeof receiptModes])}</th></tr>` : '';
            modality = line.modality;
            return `${heading}<tr><td>${escapeHtml(line.numbers)}</td><td>${cash(line.amount_minor)}</td></tr>`;
        }).join('') + '</tbody></table>';
    }).join('');
    let qr = '';
    if (ticket.print_settings?.show_qr ?? ticket.settings_snapshot?.show_qr) {
        const matrix = QRCode.create(String(ticket.code), { errorCorrectionLevel: 'M' }).modules;
        const size = matrix.size + 8, cells: string[] = [];
        for (let row = 0; row < matrix.size; row++) for (let col = 0; col < matrix.size; col++) {
            if (matrix.get(row, col)) cells.push(`M${col + 4} ${row + 4}h1v1h-1z`);
        }
        qr = `<div style="text-align:center;break-inside:avoid"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código QR del ticket" width="140" height="140" viewBox="0 0 ${size} ${size}" style="width:35mm;height:35mm" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${cells.join('')}" fill="#000"/></svg></div>`;
    }
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${escapeHtml(ticket.reference ?? ticket.code)}</title><style>@page{margin:3mm}*{box-sizing:border-box}body{font:12px/1.25 monospace;color:#000;background:#fff;margin:0 auto;max-width:${preference.paper_width === 58 ? 50 : 72}mm}h1{font-size:17px;text-align:center;margin:4px 0}p{margin:5px 0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-bottom:4px}td{padding:1px 0;text-align:left;vertical-align:top;overflow-wrap:anywhere}td:last-child{text-align:right;white-space:nowrap;padding-left:6px}th{text-align:center;padding:3px 0 1px}tr{break-inside:avoid}.draw{font-weight:bold;border-bottom:1px dashed #000;padding:3px 0;overflow-wrap:anywhere;break-after:avoid}.total{font-size:16px;font-weight:bold}</style></head><body>${company ? `<h1>${escapeHtml(company)}</h1>` : ''}<p style="text-align:center">Banca: ${escapeHtml(branchName)}</p><p style="text-align:center">${escapeHtml(new Date(ticket.created_at).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }))}</p>${payout ? `<h2 style="text-align:center;font-size:14px">COMPROBANTE DE PAGO</h2><p>Pago: ${escapeHtml(ticket.payment_reference)}</p>` : continuation ? `<h2 style="text-align:center;font-size:14px">TICKET DE CONTINUACIÓN</h2><p style="text-align:center">SORTEOS PENDIENTES · Pago ${escapeHtml(ticket.payment_reference)}</p>` : ''}<p>Ticket: ${escapeHtml(ticket.reference ?? ticket.code)}</p><p id="ticket-test" style="text-align:center;font-weight:bold"></p>${payout ? `<p>Pagado por: ${escapeHtml(ticket.paid_by)}</p><p style="text-align:center;font-weight:bold">PREMIOS PAGADOS</p>` : '<p id="ticket-pin" style="text-align:center;font-size:15px;font-weight:bold;margin-bottom:4mm"></p>'}${rows}${ticket.discount_minor > 0 ? `<p>Descuento: ${cash(ticket.discount_minor)}</p>` : ''}<p class="total">${payout ? 'Total pagado' : continuation ? 'Total pendiente' : 'Total'}: ${cash(ticket.net_minor)}</p>${paymentLabel}${continuation ? `<p>Premio pagado en esta entrega: ${cash(ticket.paid_minor)}</p><p style="text-align:center;font-weight:bold">PIN anterior invalidado · NO ES UNA NUEVA VENTA</p>` : ''}${(!ticket.payment_method || ticket.payment_method === 'cash') && ticket.received_minor != null ? `<p>Recibido: ${cash(ticket.received_minor)}</p>` : ''}${ticket.change_minor > 0 ? `<p>Devolución: ${cash(ticket.change_minor)}</p>` : ''}${qr}<p>${escapeHtml(ticket.settings_snapshot?.footer ?? '')}</p><p id="print-audit"></p><div id="paper-feed" style="height:${(preference.feed_lines ?? 2) * 4}mm"></div></body></html>`;
}
