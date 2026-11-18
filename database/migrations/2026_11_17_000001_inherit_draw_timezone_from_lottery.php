<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lotteries', fn (Blueprint $table) => $table->string('timezone', 64)->default('America/Santo_Domingo'));
        Schema::table('draws', fn (Blueprint $table) => $table->string('timezone', 64)->nullable()->default(null)->change());

        // Move a shared zone to the parent while preserving every existing effective zone.
        DB::transaction(function () {
            DB::table('lotteries')->orderBy('id')->chunkById(200, function ($lotteries) {
                foreach ($lotteries as $lottery) {
                    $zones = DB::table('draws')->where('lottery_id', $lottery->id)->whereNotNull('timezone')->distinct()->pluck('timezone');
                    $zone = $zones->count() === 1 ? $zones->first() : 'America/Santo_Domingo';
                    DB::table('lotteries')->where('id', $lottery->id)->update(['timezone' => $zone]);
                    DB::table('draws')->where('lottery_id', $lottery->id)->where('timezone', $zone)->update(['timezone' => null]);
                }
            });
        });
    }

    public function down(): void
    {
        DB::table('lotteries')->orderBy('id')->chunkById(200, function ($lotteries) {
            foreach ($lotteries as $lottery) {
                DB::table('draws')->where('lottery_id', $lottery->id)->whereNull('timezone')->update(['timezone' => $lottery->timezone]);
            }
        });
        Schema::table('draws', fn (Blueprint $table) => $table->string('timezone', 64)->nullable(false)->default('America/Santo_Domingo')->change());
        Schema::table('lotteries', fn (Blueprint $table) => $table->dropColumn('timezone'));
    }
};
