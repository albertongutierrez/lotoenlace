<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('lottery:import-results --automatic')->everyFiveMinutes()->withoutOverlapping();
