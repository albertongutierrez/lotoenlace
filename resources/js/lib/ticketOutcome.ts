type OutcomeTicket = { status: string; lines?: { prize_minor: number | string | null; paid_at?: string | null }[] };

export function ticketOutcome(ticket: OutcomeTicket): string {
    if (ticket.status === "cancelled") return "Anulado";
    const lines = ticket.lines ?? [];
    if (!lines.length) return "Pendiente";
    const pending = lines.some(line => line.prize_minor == null);
    const winners = lines.filter(line => Number(line.prize_minor) > 0);
    if (pending) return winners.length ? "Ganador · faltan resultados" : "Pendiente de resultados";
    if (!winners.length) return "Perdido";
    return winners.every(line => !!line.paid_at) ? "Ganador · pagado" : "Ganador · por pagar";
}


export function ticketOutcomeColor(ticket: OutcomeTicket): string {
    if (ticket.status === "cancelled") return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
    if (ticket.lines?.some(line => Number(line.prize_minor) > 0)) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    if (ticketOutcome(ticket) === "Perdido") return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
}
