<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class CashSession extends Model {
    use \App\Models\Concerns\HasOfficeNumber;

 protected $guarded = [];
 protected $casts = ['opening_minor'=>'integer','balance_minor'=>'integer','counted_minor'=>'integer','difference_minor'=>'integer','closed_at'=>'datetime'];
 public function movements() { return $this->hasMany(CashMovement::class); }
 public function opener() { return $this->belongsTo(User::class, 'opened_by'); }
 public function closer() { return $this->belongsTo(User::class, 'closed_by'); }
}
