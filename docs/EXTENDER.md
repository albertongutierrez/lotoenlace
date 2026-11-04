# Agregar un modulo

1. Crea una migracion nueva y el modelo. Para datos de una empresa guarda `office_id`; si dependen de la sucursal agrega `branch_office_id`. Conserva los indices y claves foraneas.
2. En consultas, filtra por la empresa/sucursal activa del usuario. Nunca uses un `office_id` enviado desde el navegador como contexto confiable. Valida tambien que los IDs relacionados pertenezcan al contexto activo.
3. Agrega permisos a `config/permissions.php`, tanto `definitions` como `route_permissions`. Coloca reglas especificas antes de comodines. Ejecuta `php artisan db:seed` para incorporar permisos sin borrar asignaciones personalizadas. Un permiso nuevo NO se concede a roles personalizados automaticamente.
4. Registra las rutas bajo `auth`, `verified`, `EnsureActiveBranch` y `permission.route`. Comprueba pertenencia al consultar/editar/eliminar un registro: usar `id_hash` no es una autorizacion.
5. Crea paginas en `resources/js/Pages` usando `AuthenticatedLayout`. Para botones consulta `auth.user.permissions` y `is_super_admin`. Agrega el enlace y su permiso en el menu del layout.
6. Usa FormRequest para validar, transacciones para cambios relacionados y pruebas de acceso denegado entre empresas. Agrega pruebas antes de desplegar.

## Consulta de ejemplo

```php
$branch = $request->user()->activeBranchOffice;
abort_unless($branch, 403, 'Selecciona una sucursal.');
$items = Item::query()
    ->where('office_id', $branch->office_id)
    ->where('branch_office_id', $branch->id)
    ->paginate(20);
```

Para la vista/edicion por ID, aplica los mismos filtros antes de `firstOrFail`. Para datos con propietario, decide explicitamente si `company.data.view_all` permite ver los registros ajenos. El permiso no debe saltarse el filtro de empresa.

`User::canDo()` utiliza el rol de la empresa activa. `accessibleBranches()` devuelve solo sucursales activas de empresas activas. `EnsureActiveBranch` descarta selecciones revocadas/inactivas y elige otro acceso permitido, o deja el contexto vacio.

La plantilla conserva el selector activo en el usuario, como el sistema original. Cambiarlo afecta otras sesiones de ese usuario; si un nuevo producto necesita contextos independientes por pestana/sesion, implementalo y prueba los limites antes de usarlo.

## Personalizacion

- Marca: `APP_NAME`, `VITE_APP_NAME`, logos de empresa y los dos layouts.
- Idioma/zona horaria: `APP_LOCALE`, `APP_TIMEZONE`, `lang`.
- SMTP: `.env`; nunca en el repositorio.
- Navegacion de regreso: `BackLink` y `contextualNavigation`. Los enlaces del menu llevan `data-navigation-menu`.
- Parametros de modulos: agrega configuracion propia. No se heredan parametros fiscales/comerciales de ENLACE.

Los permisos y las empresas son la base comun. Las reglas particulares del negocio deben agregarse en sus propios servicios/controladores, sin incorporarlas a `HandleInertiaRequests`.
