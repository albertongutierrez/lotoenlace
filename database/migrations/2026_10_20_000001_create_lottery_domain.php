<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('offices', function (Blueprint $t) {
            $t->string('currency', 3)->default('DOP');
            $t->json('lottery_settings')->nullable();
        });
        Schema::table('branch_offices', function (Blueprint $t) {
            $t->json('lottery_settings')->nullable();
        });
        Schema::create('lotteries', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->boolean('active')->default(true);
            $t->timestamps();
        });
        Schema::create('draws', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lottery_id')->constrained();
            $t->string('name');
            $t->time('opens_at');
            $t->time('closes_at');
            $t->time('draws_at');
            $t->json('weekdays');
            $t->json('modalities');
            $t->json('exceptions')->nullable();
            $t->string('source_url')->nullable();
            $t->string('source_key')->nullable();
            $t->boolean('active')->default(true);
            $t->timestamps();
        });
        Schema::create('bet_limits', function (Blueprint $t) {
            $t->id();
            $t->foreignId('office_id')->constrained();
            $t->foreignId('branch_office_id')->nullable()->constrained();
            $t->string('name');
            $t->string('modality');
            $t->string('category')->default('all');
            $t->string('match_type')->default('exact');
            $t->string('numbers')->nullable();
            $t->json('draw_ids')->nullable();
            $t->json('pairs')->nullable();
            $t->string('aggregation')->default('shared');
            $t->unsignedBigInteger('amount_minor');
            $t->date('starts_on')->nullable();
            $t->date('ends_on')->nullable();
            $t->boolean('active')->default(true);
            $t->timestamps();
            $t->index(['office_id', 'active']);
        });
        Schema::create('tickets', function (Blueprint $t) {
            $t->id();
            $t->uuid('code')->unique();
            $t->foreignId('office_id')->constrained();
            $t->foreignId('branch_office_id')->constrained();
            $t->foreignId('user_id')->constrained();
            $t->uuid('request_key');
            $t->string('request_hash', 64);
            $t->string('currency', 3);
            $t->date('business_date');
            $t->string('status')->default('sold');
            $t->unsignedBigInteger('gross_minor');
            $t->unsignedBigInteger('discount_minor');
            $t->unsignedBigInteger('net_minor');
            $t->unsignedBigInteger('commission_minor');
            $t->json('settings_snapshot');
            $t->timestamp('cancelled_at')->nullable();
            $t->timestamps();
            $t->unique(['office_id', 'request_key']);
            $t->index(['office_id', 'business_date', 'status']);
        });
        Schema::create('ticket_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('ticket_id')->constrained();
            $t->foreignId('draw_id')->constrained();
            $t->foreignId('second_draw_id')->nullable()->constrained('draws');
            $t->string('modality');
            $t->string('numbers');
            $t->timestamp('closes_at');
            $t->unsignedBigInteger('amount_minor');
            $t->unsignedBigInteger('net_minor');
            $t->unsignedBigInteger('commission_minor');
            $t->json('rules');
            $t->unsignedBigInteger('prize_minor')->nullable();
            $t->timestamp('paid_at')->nullable();
            $t->foreignId('paid_by')->nullable()->constrained('users');
            $t->timestamps();
        });
        Schema::create('draw_results', function (Blueprint $t) {
            $t->id();
            $t->foreignId('draw_id')->constrained();
            $t->date('business_date');
            $t->json('numbers');
            $t->string('status')->default('pending');
            $t->string('source_url')->nullable();
            $t->text('evidence')->nullable();
            $t->foreignId('confirmed_by')->nullable()->constrained('users');
            $t->timestamps();
            $t->unique(['draw_id', 'business_date']);
        });
        Schema::create('lottery_audits', function (Blueprint $t) {
            $t->id();
            $t->foreignId('office_id')->nullable()->constrained();
            $t->foreignId('user_id')->nullable()->constrained();
            $t->string('action');
            $t->json('payload');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['lottery_audits', 'draw_results', 'ticket_lines', 'tickets', 'bet_limits', 'draws', 'lotteries'] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::table('branch_offices', fn (Blueprint $t) => $t->dropColumn('lottery_settings'));
        Schema::table('offices', fn (Blueprint $t) => $t->dropColumn(['currency', 'lottery_settings']));
    }
};
