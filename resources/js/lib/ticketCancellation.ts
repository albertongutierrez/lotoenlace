import { useEffect, useState } from 'react';

export function useCancellationClock() {
    const [now, setNow] = useState(Date.now);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    return now;
}

export function canCancelTicket(ticket: any, now: number, receivedAt: number): boolean {
    const state = ticket?.cancellation;
    if (ticket?.status !== 'sold' || !state?.allowed || ticket.lines?.some((line: any) => line.paid_at)) return false;
    // Advance from the server clock so an incorrect PC clock cannot extend the deadline.
    const serverNow = Date.parse(state.checked_at) + Math.max(0, now - receivedAt);
    return Date.parse(state.expires_at) > serverNow;
}
