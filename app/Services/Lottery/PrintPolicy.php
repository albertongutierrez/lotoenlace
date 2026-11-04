<?php

namespace App\Services\Lottery;

use App\Models\Ticket;

class PrintPolicy
{
    public function isTestOffice(int $officeId): bool
    {
        // Reprinting always follows the normal policy, including former test offices.
        return false;
    }

    public function denial(Ticket $ticket): ?string
    {
        if ($this->isTestOffice($ticket->office_id)) return null;
        if ($ticket->status !== 'sold') return 'Ticket anulado.';
        if ($ticket->business_date !== now()->timezone('America/Santo_Domingo')->toDateString()) return 'Solo se pueden imprimir tickets de hoy.';
        if (now()->gte($ticket->created_at->copy()->addMinutes((int) ($ticket->settings_snapshot['reprint_minutes'] ?? 15)))) return 'Venció el plazo de impresión/reimpresión.';
        return null;
    }
}
