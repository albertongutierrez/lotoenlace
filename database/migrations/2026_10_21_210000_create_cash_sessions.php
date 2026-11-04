<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void {
  Schema::create('cash_sessions', function (Blueprint $t) {
   $t->id(); $t->foreignId('office_id')->constrained(); $t->foreignId('branch_office_id')->constrained();
   $t->unsignedBigInteger('active_branch_id')->nullable()->unique();
   $t->foreignId('opened_by')->constrained('users'); $t->foreignId('closed_by')->nullable()->constrained('users');
   $t->uuid('request_key')->unique(); $t->string('currency', 3); $t->string('status')->default('open');
   $t->bigInteger('opening_minor'); $t->bigInteger('balance_minor'); $t->bigInteger('counted_minor')->nullable(); $t->bigInteger('difference_minor')->nullable();
   $t->text('opening_note')->nullable(); $t->text('closing_note')->nullable(); $t->timestamp('closed_at')->nullable(); $t->timestamps();
  });
  Schema::create('cash_movements', function (Blueprint $t) {
   $t->id(); $t->foreignId('cash_session_id')->constrained(); $t->foreignId('office_id')->constrained(); $t->foreignId('user_id')->constrained();
   $t->foreignId('ticket_id')->nullable()->constrained(); $t->string('event_key')->unique(); $t->string('type'); $t->bigInteger('amount_minor');
   $t->bigInteger('balance_minor'); $t->text('note'); $t->timestamps();
  });
  Schema::table('tickets', fn (Blueprint $t) => $t->foreignId('cash_session_id')->nullable()->constrained());
 }
 public function down(): void {
  Schema::table('tickets', fn (Blueprint $t) => $t->dropConstrainedForeignId('cash_session_id'));
  Schema::dropIfExists('cash_movements'); Schema::dropIfExists('cash_sessions');
 }
};
