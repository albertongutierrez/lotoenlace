import { useState } from 'react';
import IssuedTicketModal, { PrintConfirmation } from './IssuedTicketModal';
import { Draw } from './shared';

// Keep the paid document mounted until its send is confirmed, then print the
// continuation. A retry of the second document never resends the first one.
export default function PaymentPrintModal({ payout, continuation, branchId, draws, onClose }: {
    payout: any; continuation?: any; branchId: number; draws: Draw[]; onClose: () => void;
}) {
    const [index, setIndex] = useState(0);
    const [previousPrints, setPreviousPrints] = useState<{ label: string; confirmation: PrintConfirmation }[]>([]);
    const documents = continuation ? [payout, continuation] : [payout];
    const ticket = documents[index];
    return <IssuedTicketModal
        key={`${ticket.document_type}:${ticket.payment_id}`}
        ticket={ticket}
        branch={{ id: branchId, code: ticket.branch, name: ticket.branch_name }}
        draws={draws}
        currency={ticket.currency}
        onClose={onClose}
        previousPrints={previousPrints}
        onPrinted={confirmation => {
            if (index >= documents.length - 1) return;
            setPreviousPrints([{ label: 'Comprobante de pago', confirmation }]);
            setIndex(current => current === index ? current + 1 : current);
        }}
    />;
}
