<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class EnsureRoutePermission
{
    public function handle(Request $request, Closure $next): Response
    {

        $routeName = $request->route()?->getName();

        if (! $routeName) {

            return $next($request);

        }

        foreach (config('permissions.route_permissions', []) as $pattern => $permissions) {

            if (! Str::is($pattern, $routeName)) {

                continue;

            }

            $allowed = collect(Arr::wrap($permissions))

                ->contains(fn (string $permission) => (bool) $request->user()?->canDo($permission));

            abort_unless($allowed, 403, 'No tienes permiso para acceder a esta opcion.');

            break;

        }

        abort_unless(isset($allowed), 403, 'No hay una politica de permiso definida para esta opcion.');

        return $next($request);

    }
}
