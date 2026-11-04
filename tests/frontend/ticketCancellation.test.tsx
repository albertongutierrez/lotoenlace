import { expect, test } from 'vitest';
import { canCancelTicket } from '../../resources/js/lib/ticketCancellation';

test('la anulación expira con el reloj del servidor aunque la PC tenga otra fecha', () => {
    const received = Date.parse('2030-01-01T18:00:00Z');
    const ticket = { status: 'sold', cancellation: { allowed: true, checked_at: '2026-10-22T12:00:00Z', expires_at: '2026-10-22T12:05:00Z' }, lines: [] };
    expect(canCancelTicket(ticket, received, received)).toBe(true);
    expect(canCancelTicket(ticket, received + 299999, received)).toBe(true);
    expect(canCancelTicket(ticket, received + 300000, received)).toBe(false);
    expect(canCancelTicket({ ...ticket, cancellation: { ...ticket.cancellation, allowed: false } }, received, received)).toBe(false);
    expect(canCancelTicket({ ...ticket, lines: [{ paid_at: '2026-10-22T12:00:00Z' }] }, received, received)).toBe(false);
    expect(canCancelTicket({ status: 'sold' }, received, received)).toBe(false);
});
