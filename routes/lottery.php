<?php

use App\Http\Controllers\LotteryController;
use App\Http\Middleware\EnsureActiveBranch;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', EnsureActiveBranch::class, 'permission.route'])->prefix('lottery')->name('lottery.')->group(function () {
    Route::get('print-agent/download', [\App\Http\Controllers\PrintAgentController::class, 'download'])->name('print-agent.download');
    Route::get('reports', [\App\Http\Controllers\ReportController::class, 'index'])->name('reports');
    Route::get('cash-status', [\App\Http\Controllers\CashController::class, 'status'])->name('cash-status');
    Route::get('cash', [\App\Http\Controllers\CashController::class, 'index'])->name('cash');
    Route::get('cash/{id}', [\App\Http\Controllers\CashController::class, 'show'])->whereNumber('id')->name('cash.show');
    Route::post('cash/open', [\App\Http\Controllers\CashController::class, 'open'])->name('cash.open');
    Route::post('cash/{id}/movements', [\App\Http\Controllers\CashController::class, 'movement'])->whereNumber('id')->name('cash.movement');
    Route::post('cash/{id}/close', [\App\Http\Controllers\CashController::class, 'close'])->whereNumber('id')->name('cash.close');
    Route::get('catalog', [LotteryController::class, 'catalog'])->name('catalog');
    Route::post('catalog/lotteries', [LotteryController::class, 'saveLottery'])->name('catalog.lottery');
    Route::get('catalog/lotteries/{lottery}', [LotteryController::class, 'lotteryDetail'])->name('catalog.detail');
    Route::post('catalog/draws', [LotteryController::class, 'saveDraw'])->name('catalog.draw');
    Route::get('settings', [LotteryController::class, 'settings'])->name('settings');
    Route::get('consortium/{office}', [LotteryController::class, 'consortium'])->name('settings.consortium');
    Route::put('consortium/{office}/details', [\App\Http\Controllers\Settings\OfficeController::class, 'update'])->name('settings.details');
    Route::post('settings', [LotteryController::class, 'saveSettings'])->name('settings.save');
    Route::get('limits', [LotteryController::class, 'limits'])->name('limits');
    Route::post('limits', [LotteryController::class, 'saveLimit'])->name('limits.save');
    Route::delete('limits/{limit}', [LotteryController::class, 'deleteLimit'])->whereNumber('limit')->name('limits.delete');
    Route::get('sales', [LotteryController::class, 'sales'])->name('sales');
    Route::get('published-results', [LotteryController::class, 'publishedResults'])->name('published-results');
    Route::post('availability', [LotteryController::class, 'availability'])->name('availability');
    Route::post('sales', [LotteryController::class, 'sell'])->name('sell');
    Route::get('tickets', [LotteryController::class, 'tickets'])->name('tickets');
    Route::get('tickets/{code}', [LotteryController::class, 'ticket'])->name('ticket');
    Route::post('tickets/{code}/print', [LotteryController::class, 'requestPrint'])->name('print');
    Route::post('tickets/{code}/print-status', [LotteryController::class, 'printStatus'])->name('print-status');
    Route::get('tickets/{code}/print-history', [LotteryController::class, 'printHistory'])->name('print-history');
    Route::post('tickets/{code}/cancel', [LotteryController::class, 'cancel'])->name('cancel');
    Route::post('sales/tickets/{code}/pay', [LotteryController::class, 'pay'])->name('pay');
    Route::post('results/sync', [LotteryController::class, 'syncResults'])->name('results.sync');
    Route::get('results', [LotteryController::class, 'results'])->name('results');
    Route::delete('results/{result}', [LotteryController::class, 'deleteResult'])->whereNumber('result')->name('results.delete');
    Route::post('results', [LotteryController::class, 'saveResult'])->name('results.save');
});
