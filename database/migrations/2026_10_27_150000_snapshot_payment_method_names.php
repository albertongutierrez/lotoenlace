<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['tickets', 'cash_movements'] as $table) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->string('payment_method_label', 80)->nullable());
        }
    }

    public function down(): void
    {
        foreach (['tickets', 'cash_movements'] as $table) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropColumn('payment_method_label'));
        }
    }
};
