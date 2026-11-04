// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { ticketReceiptHtml } from '../../resources/js/lib/ticketReceipt';
import { defaultPreference } from '../../resources/js/lib/localPrinter';

test('el comprobante del navegador muestra sorteos compartidos, modalidades ordenadas y montos sin duplicar', () => {
    const draws = [{ id: 1, name: 'Nombre completo del primer sorteo' }, { id: 2, name: 'Segundo sorteo' }];
    const ticket = { reference: 'T-000001', created_at: '2026-10-21T12:00:00Z', gross_minor: 800, discount_minor: 0, net_minor: 800, lines: [1, 2].flatMap(draw_id => ['super_pale', 'tripleta', 'pale', 'quiniela'].map((modality, i) => ({ draw_id, modality, numbers: `${i + 1}0`, amount_minor: 100 }))) };
    const doc = new DOMParser().parseFromString(ticketReceiptHtml(ticket, draws, { code: '001' }, 'DOP', { ...defaultPreference, feed_lines: 0 }), 'text/html');
    expect([...doc.querySelectorAll('.draw')].map(d => d.textContent)).toEqual(draws.map(d => d.name));
    expect([...doc.querySelectorAll('th')].map(d => d.textContent)).toEqual(['Quiniela', 'Palé', 'Tripleta', 'Súper palé']);
    expect(doc.querySelectorAll('tbody tr td:first-child')).toHaveLength(4);
    expect(doc.querySelector('table')?.previousElementSibling?.textContent).toBe('Segundo sorteo');
    expect(doc.getElementById('paper-feed')?.getAttribute('style')).toBe('height:0mm');
    expect(doc.getElementById('print-audit')?.nextElementSibling?.id).toBe('paper-feed');
    expect(doc.querySelector('.total')?.textContent).toBe('Total: RD$8.00');
});

test('los nombres se escapan y el espacio final respeta la configuración', () => {
    const ticket = { created_at: '2026-10-21T12:00:00Z', gross_minor: 100, discount_minor: 0, net_minor: 100, lines: [{ draw_id: 1, draw: { name: '<script>nombre</script>' }, modality: 'quiniela', numbers: '10', amount_minor: 100 }] };
    const html = ticketReceiptHtml(ticket, [], { code: '001' }, 'DOP', { ...defaultPreference, feed_lines: 5 });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('.draw')?.textContent).toBe('<script>nombre</script>');
    expect(doc.getElementById('paper-feed')?.getAttribute('style')).toBe('height:20mm');
});

test('muestra empresa y banca, separa el PIN y oculta descuento y devolución en cero', () => {
    for (const extras of [false, true]) {
        const ticket = { created_at: '2026-10-22T12:00:00Z', print_settings: { company_name: 'Empresa Demo', branch_name: 'Banca Centro' }, gross_minor: 100, net_minor: extras ? 75 : 100, discount_minor: extras ? 25 : 0, received_minor: 200, change_minor: extras ? 125 : 0, lines: [] };
        const doc = new DOMParser().parseFromString(ticketReceiptHtml(ticket, [], { code: '001' }, 'DOP', defaultPreference), 'text/html');
        expect(doc.querySelector('h1')?.textContent).toBe('Empresa Demo');
        expect(doc.querySelector('h1')?.nextElementSibling?.textContent).toBe('Banca: Banca Centro');
        expect(doc.body.textContent).not.toContain('LotoEnlace');
        expect(doc.body.textContent).not.toContain('Apostado');
        expect(doc.body.textContent?.includes('Descuento:')).toBe(extras);
        expect(doc.body.textContent?.includes('Devolución:')).toBe(extras);
        expect(doc.body.textContent).toContain('Recibido: RD$2.00');
        expect(doc.getElementById('ticket-pin')?.style.marginBottom).toBe('4mm');
    }
});

test('el comprobante de pago identifica el premio, fecha y cajero y no contiene el PIN', () => {
    const ticket = { document_type: 'payout', payment_reference: 'P-000041', reference: 'T-000001', created_at: '2026-10-22T12:00:00Z', paid_by: 'Cajero Demo', print_settings: { company_name: 'Empresa Demo', branch_name: 'Banca Centro', show_qr: false }, net_minor: 7500, lines: [{ draw: 'Sorteo histórico', draw_id: 99, modality: 'quiniela', numbers: '10', amount_minor: 7500 }] };
    const doc = new DOMParser().parseFromString(ticketReceiptHtml(ticket, [], { code: '001' }, 'DOP', defaultPreference), 'text/html');
    expect(doc.body.textContent).toContain('COMPROBANTE DE PAGO');
    expect(doc.body.textContent).toContain('P-000041');expect(doc.body.textContent).toContain('T-000001');
    expect(doc.body.textContent).toContain('Cajero Demo');expect(doc.body.textContent).toContain('Total pagado: RD$75.00');
    expect(doc.body.textContent).toContain('Sorteo histórico');expect(doc.getElementById('ticket-pin')).toBeNull();
    expect(doc.querySelector('svg')).toBeNull();
});

test('un cobro por transferencia identifica el medio sin presentar dinero recibido en efectivo', () => {
    const ticket = { created_at: '2026-10-22T12:00:00Z', payment_method: 'transfer', net_minor: 1000, received_minor: 1000, change_minor: 0, lines: [] };
    const doc = new DOMParser().parseFromString(ticketReceiptHtml(ticket, [], { code: '001' }, 'DOP', defaultPreference), 'text/html');
    expect(doc.body.textContent).toContain('Cobro: Transferencia');
    expect(doc.body.textContent).not.toContain('Recibido:');
    expect(doc.body.textContent).not.toContain('Devolución:');
});

test('el recibo conserva el nombre personalizado del cobro y lo escapa para ambos anchos', () => {
    for (const paper_width of [58, 80] as const) {
        const ticket = { created_at: '2026-10-22T12:00:00Z', payment_method: 'custom_0123456789ab', payment_method_label: 'PayPal <Empresa> & App', net_minor: 1000, received_minor: 1000, change_minor: 0, lines: [] };
        const doc = new DOMParser().parseFromString(ticketReceiptHtml(ticket, [], { code: '001' }, 'DOP', { ...defaultPreference, paper_width }), 'text/html');
        expect(doc.body.textContent).toContain('Cobro: PayPal <Empresa> & App');
        expect(doc.body.textContent).not.toContain('custom_');
        expect(doc.body.textContent).not.toContain('Recibido:');
        expect(doc.querySelector('Empresa')).toBeNull();
    }
});
