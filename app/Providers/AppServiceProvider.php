<?php

namespace App\Providers;

use Illuminate\Foundation\DevCommands;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void {}

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {

        Password::defaults(fn () => Password::min(10)->mixedCase()->numbers());

        // A sync connection needs no worker. On Windows avoid queue:listen's
        // recurring shell launches when an asynchronous worker is needed.
        if (PHP_OS_FAMILY === 'Windows' && $this->app->environment('local') && $this->app->runningInConsole()) {
            if (config('queue.default') === 'sync') {
                DevCommands::except('queue');
            } else {
                DevCommands::artisan('queue:work --tries=1 --timeout=0 --sleep=3', 'queue');
            }
        }

    }
}
