<?php

use App\Models\Office;
use App\Services\ConsortiumRoles;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration {
    public function up(): void
    {
        Office::withTrashed()->each(fn (Office $office) => app(ConsortiumRoles::class)->initialize($office));
    }

    public function down(): void
    {
        // Copies may have been edited or assigned; preserve them on rollback.
    }
};
