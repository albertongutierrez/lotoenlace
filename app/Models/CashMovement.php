<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class CashMovement extends Model {
    use \App\Models\Concerns\HasOfficeNumber;

 protected $guarded = [];
 protected $casts = ['amount_minor'=>'integer','balance_minor'=>'integer'];
 protected $appends = ['payment_method_label'];
 public function getPaymentMethodLabelAttribute(?string $value): string {
  $method=$this->payment_method ?? 'cash';
  return $value ?? (\App\Services\Lottery\Configuration::PAYMENT_METHODS[$method] ?? $method);
 }
 public function user() { return $this->belongsTo(User::class); }
 public function ticket() { return $this->belongsTo(Ticket::class); }
}
