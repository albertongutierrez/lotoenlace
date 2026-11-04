<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('offices', function (Blueprint $table) {
            $table->id();
            $table->string('id_hash', 24)->unique();
            $table->string('name', 120);
            foreach (['slogan', 'legal_name', 'tax_id', 'phone', 'email', 'address', 'logo_path', 'compact_logo_path'] as $column) {
                $table->string($column)->nullable();
            }
            $table->boolean('show_print_company_details')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });
        Schema::create('branch_offices', function (Blueprint $table) {
            $table->id();
            $table->string('id_hash', 24)->unique();
            $table->foreignId('office_id')->constrained()->restrictOnDelete();
            $table->string('name', 120);
            $table->string('code', 20);
            foreach (['phone', 'mobile_phone', 'email'] as $column) {
                $table->string($column)->nullable();
            }
            $table->text('address')->nullable();
            $table->boolean('is_main')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['office_id', 'code']);
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('id_hash', 24)->unique();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->rememberToken();
            $table->foreignId('active_branch_office_id')->nullable()->constrained('branch_offices')->nullOnDelete();
            $table->timestamps();
        });
        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('id_hash', 24)->unique();
            $table->foreignId('office_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('slug', 80);
            $table->string('description')->nullable();
            $table->boolean('is_system')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['office_id', 'slug']);
        });
        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('id_hash', 24)->unique();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('module');
            $table->string('description')->nullable();
            $table->timestamps();
        });
        Schema::create('permission_role', function (Blueprint $table) {
            $table->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['permission_id', 'role_id']);
        });
        Schema::create('role_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('office_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['role_id', 'user_id', 'office_id']);
        });
        Schema::create('branch_office_user', function (Blueprint $table) {
            $table->foreignId('branch_office_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->primary(['branch_office_id', 'user_id']);
        });
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
        Schema::create('failed_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('uuid')->unique();
            $table->text('connection');
            $table->text('queue');
            $table->longText('payload');
            $table->longText('exception');
            $table->timestamp('failed_at')->useCurrent();
        });
    }

    public function down(): void
    {
        foreach (['failed_jobs', 'personal_access_tokens', 'branch_office_user', 'role_user', 'permission_role', 'permissions', 'roles', 'password_reset_tokens', 'users', 'branch_offices', 'offices'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
