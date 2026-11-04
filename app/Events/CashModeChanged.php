<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class CashModeChanged implements ShouldBroadcastNow
{
    public function __construct(private readonly int $officeId, private readonly int $branchId) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("lottery.cash.{$this->officeId}.{$this->branchId}")];
    }

    public function broadcastAs(): string { return 'cash.status.changed'; }

    public function broadcastWith(): array
    {
        return ['office_id' => $this->officeId, 'branch_id' => $this->branchId, 'session_id' => null, 'state' => 'configuration_changed'];
    }
}
