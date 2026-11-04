<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LotteryAudit extends Model
{
    use \App\Models\Concerns\HasOfficeNumber;

    protected $guarded = [];

    protected $casts = ['payload' => 'array'];
}
