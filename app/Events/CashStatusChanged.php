<?php

namespace App\Events;

use App\Models\CashSession;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class CashStatusChanged implements ShouldBroadcastNow
{
    public function __construct(private readonly CashSession $session) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("lottery.cash.{$this->session->office_id}.{$this->session->branch_office_id}")];
    }

    public function broadcastAs(): string
    {
        return 'cash.status.changed';
    }

    public function broadcastWith(): array
    {
        // Never broadcast balances, counted cash, differences, movements or notes.
        return [
            'office_id' => $this->session->office_id,
            'branch_id' => $this->session->branch_office_id,
            'session_id' => $this->session->id,
            'state' => $this->session->status,
        ];
    }
}
