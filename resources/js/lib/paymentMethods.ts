export const paymentMethods: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', deposit: 'Depósito' };

export function paymentMethodName(method = 'cash', labels: Record<string, string> = {}): string {
    return labels[method] ?? paymentMethods[method] ?? method;
}

export function ticketPaymentMethodName(ticket: any): string {
    return ticket.payment_method_label ?? paymentMethodName(ticket.payment_method ?? 'cash', ticket.settings_snapshot?.payment_method_labels);
}
