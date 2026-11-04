<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class ResultSyncRun extends Model {
 public $timestamps=false;
 protected $guarded=[];
 protected $casts=['started_at'=>'datetime','finished_at'=>'datetime','stats'=>'array'];
}
