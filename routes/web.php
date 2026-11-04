<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\Settings\ActiveBranchOfficeController;
use App\Http\Controllers\Settings\BranchOfficeController;
use App\Http\Controllers\Settings\OfficeController;
use App\Http\Controllers\Settings\RoleController;
use App\Http\Controllers\Settings\UserController;
use App\Http\Middleware\EnsureActiveBranch;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/login');
// Public verification material only; the private key never leaves the server.
Route::get('/printing-agent/public-key', [\App\Http\Controllers\PrintAgentController::class, 'publicKey'])->middleware('throttle:30,1');
// Public installer sources: contains no server secrets, receipts, PINs or workstation configuration.
Route::get('/printing-agent/package', [\App\Http\Controllers\PrintAgentController::class, 'package'])->middleware('throttle:20,1');

Route::middleware(['auth', EnsureActiveBranch::class])->group(function () {
    Route::get('/dashboard', \App\Http\Controllers\DashboardController::class)->middleware('verified')->name('dashboard');
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::patch('/settings/active-branch-office', [ActiveBranchOfficeController::class, 'update'])->name('settings.active-branch-office.update');
    Route::middleware(['verified', 'permission.route', \App\Http\Middleware\ConsortiumContext::class])->prefix('settings')->name('settings.')->group(function () {
        Route::resource('offices', OfficeController::class)->except('show');
        Route::resource('branch-offices', BranchOfficeController::class)->except('show');
        Route::resource('users', UserController::class)->except('show');
        Route::resource('roles', RoleController::class)->except('show');
    });
});

require __DIR__.'/auth.php';

require __DIR__.'/lottery.php';
