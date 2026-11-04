<?php

namespace App\Support;

class PostLoginRedirect
{
    public static function routeNameFor($user): string
    {

        return 'dashboard';

    }
}
