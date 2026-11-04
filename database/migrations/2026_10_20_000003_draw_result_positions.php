<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('draws', fn (Blueprint $t) => $t->unsignedTinyInteger('result_count')->default(3));
    }

    public function down(): void
    {
        Schema::table('draws', fn (Blueprint $t) => $t->dropColumn('result_count'));
    }
};
