<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('draws', function (Blueprint $table) {
            $table->string('abbreviation', 40)->nullable();
            $table->string('timezone', 64)->default('America/Santo_Domingo');
        });
        Schema::table('ticket_lines', function (Blueprint $table) {
            $table->date('draw_date')->nullable();
            $table->date('second_draw_date')->nullable();
            $table->index(['draw_id', 'draw_date']);
            $table->index(['second_draw_id', 'second_draw_date']);
        });
    }

    public function down(): void
    {
        Schema::table('ticket_lines', function (Blueprint $table) {
            $table->dropIndex(['draw_id', 'draw_date']);
            $table->dropIndex(['second_draw_id', 'second_draw_date']);
            $table->dropColumn(['draw_date', 'second_draw_date']);
        });
        Schema::table('draws', fn (Blueprint $table) => $table->dropColumn(['abbreviation', 'timezone']));
    }
};
