<?php
namespace App\Models\Concerns;
trait HasOfficeNumber {
    protected static function bootHasOfficeNumber():void {
        static::creating(function($model){if($model->office_id!==null)$model->office_number=app(\App\Services\OfficeSequence::class)->next((int)$model->office_id,$model->getTable());});
    }
}
