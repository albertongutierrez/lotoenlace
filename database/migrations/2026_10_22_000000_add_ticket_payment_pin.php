<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->text('payment_pin')->nullable();
        });

        // Existing tickets also require a PIN. Preserve it across every later print.
        DB::table('tickets')->select('id')->orderBy('id')->chunkById(200, function ($tickets) {
            foreach ($tickets as $ticket) {
                $pin = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                DB::table('tickets')->where('id', $ticket->id)->update(['payment_pin' => Crypt::encryptString($pin)]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('tickets', fn (Blueprint $table) => $table->dropColumn('payment_pin'));
    }
};
