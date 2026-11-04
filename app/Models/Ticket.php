<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Ticket extends Model
{
    use \App\Models\Concerns\HasOfficeNumber;

    protected $guarded = [];
    protected $hidden = ['payment_pin'];
    protected $appends = ['reference', 'payment_method_label'];

    public function getPaymentMethodLabelAttribute(?string $value): string
    {
        $method = $this->payment_method ?? 'cash';
        return $value ?? (\App\Services\Lottery\Configuration::paymentMethodLabels($this->settings_snapshot ?? [])[$method] ?? $method);
    }

    protected static function booted(): void
    {
        static::creating(function (Ticket $ticket) {
            $ticket->payment_pin = self::generatePaymentPin();
        });
    }

    public static function generatePaymentPin(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }
    public function getReferenceAttribute():string { return $this->office_number ? 'T-'.str_pad((string)$this->office_number,6,'0',STR_PAD_LEFT) : (string)$this->code; }
    public function scopeWithReference($query,string $reference) {
        return preg_match('/^(?:T-)?(\\d{1,18})$/iD',trim($reference),$match) ? $query->where('office_number',(int)$match[1]) : $query->where('code',$reference);
    }

    protected $casts = ['settings_snapshot' => 'array', 'cancelled_at' => 'datetime', 'payment_pin' => 'encrypted'];

    public function lines()
    {
        return $this->hasMany(TicketLine::class);
    }
}
