<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->unsignedBigInteger('received_minor')->nullable();
            $table->unsignedBigInteger('change_minor')->nullable();
        });
    }
    public function down(): void
    {
        Schema::table('tickets', fn (Blueprint $table) => $table->dropColumn(['received_minor', 'change_minor']));
    }
};
