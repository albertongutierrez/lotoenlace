import { useState } from "react";
import { router, usePage } from "@inertiajs/react";
import { Dialog } from "@headlessui/react";
import { Plus, Pencil, Trash2, Settings2, RotateCcw } from "lucide-react";
import Modal from "@/Components/Modal";
import { DataTable, DataColumn } from "@/Components/ui/data-table";
import { RowActions } from "@/Components/ui/row-actions";
import BranchOfficeForm from "@/Pages/Settings/BranchOffices/BranchOfficeForm";
import UserForm from "@/Pages/Settings/Users/UserForm";
import RoleForm from "@/Pages/Settings/Roles/RoleForm";
import { PageProps } from "@/types";
import { hasBranchOverrides } from "@/lib/branchSettings";
import { button, input, panel, secondary } from "./shared";

export default function ConsortiumManagement({ tab, office, branches, management, configure }: any) {
    const { auth } = usePage<PageProps>().props;
    const can = (permission: string) => !!auth.user.is_super_admin || !!auth.user.permissions?.includes(permission);
    const [search, setSearch] = useState("");
    const [editor, setEditor] = useState<any>(undefined);
    const [deleting, setDeleting] = useState<any>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const resource = tab === "branches" ? "branch-offices" : tab;
    const permission = tab === "branches" ? "settings.branch-offices" : tab;
    const create = can(tab === "roles" ? "roles.manage" : `${permission}.create`);
    const edit = can(tab === "roles" ? "roles.manage" : `${permission}.update`);
    const remove = can(tab === "roles" ? "roles.manage" : `${permission}.delete`);
    const label = tab === "branches" ? "banca" : tab === "users" ? "usuario" : "rol";
    const back = `/lottery/consortium/${office.id_hash}?tab=${tab}`;
    const endpoint = (record?: any) => `/settings/${resource}${record ? `/${record.id_hash}` : ""}?consortium=${office.id_hash}`;
    const records = tab === "branches" ? branches : tab === "users" ? management.members : management.roles;
    const rows = records.filter((r: any) => `${r.name} ${r.code ?? ""} ${r.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));
    const columns: DataColumn<any>[] = [
        { accessorKey: "name", header: tab === "branches" ? "Banca" : tab === "users" ? "Usuario" : "Rol", cell: ({ row: { original: r } }) => <div className="font-medium">{r.name}<p className="text-xs font-normal text-slate-500">{r.code ?? r.email ?? r.description}</p></div> },
        ...(tab === "users" ? [
            { id: "roles", header: "Roles", cell: ({ row }: any) => row.original.roles.map((r: any) => r.name).join(", ") },
            { id: "branches", header: "Bancas asignadas", cell: ({ row }: any) => row.original.branch_offices.map((b: any) => b.code).join(", ") || "Sin asignación" },
        ] : tab === "roles" ? [
            { accessorKey: "permissions_count", header: "Permisos", sortFn: "basic" as const },
            { accessorKey: "users_count", header: "Usuarios", sortFn: "basic" as const },
            { id: "kind", header: "Tipo", cell: ({ row }: any) => row.original.is_system ? "Sistema · compartido" : "Del consorcio" },
        ] : [
            { id: "contact", header: "Contacto", cell: ({ row }: any) => [row.original.phone, row.original.mobile_phone].filter(Boolean).join(" / ") || "—" },
            { id: "config", header: "Configuración", cell: ({ row }: any) => hasBranchOverrides(row.original.lottery_settings) ? "Con excepciones propias" : "Hereda del consorcio" },
        ]),
        ...(tab !== "users" ? [{ id: "status", header: "Estado", cell: ({ row }: any) => row.original.is_active ? "Activo" : "Inactivo" }] : []),
        { id: "actions", header: "Acciones", cell: ({ row: { original: r } }) => {
            const manageable = tab === "roles" ? !r.is_system : tab === "users" ? r.can_manage : true;
            const actions = [
                ...(tab === "branches" && can("lottery.settings") ? [{ label: "Configurar", icon: Settings2, onClick: () => configure(r) }] : []),
                ...(tab === "branches" && can("lottery.settings") ? [{ label: "Ver excepciones", icon: RotateCcw, onClick: () => configure(r, "overrides") }] : []),
                ...(edit && manageable ? [{ label: tab === "roles" ? "Editar rol y permisos" : "Editar", icon: Pencil, onClick: () => setEditor(r) }] : []),
                ...(remove && manageable && !(tab === "roles" && r.is_system) && !(tab === "users" && r.id === auth.user.id) ? [{ label: "Eliminar", icon: Trash2, destructive: true, onClick: () => { setError(""); setDeleting(r); } }] : []),
            ];
            return actions.length ? <RowActions label={r.name} actions={actions} /> : <span className="text-xs text-slate-500">Solo lectura</span>;
        } },
    ];
    return <section className={`${panel} !p-0 overflow-hidden`}>
        <div className="flex flex-wrap justify-between gap-3 p-4"><input className={`${input} !w-auto min-w-48 flex-1`} aria-label={`Buscar ${label}`} placeholder={`Buscar ${label}…`} value={search} onChange={e => setSearch(e.target.value)} />{create && <button className={`${button} inline-flex items-center gap-2`} onClick={() => setEditor(null)}><Plus size={16} aria-hidden />{tab === "branches" ? "Nueva banca" : tab === "users" ? "Nuevo usuario" : "Nuevo rol"}</button>}</div>
        <DataTable data={rows} columns={columns} getRowId={r => String(r.id)} resetKey={search} />
        <Modal show={editor !== undefined} onClose={() => setEditor(undefined)}><div className="max-h-[85dvh] overflow-y-auto p-5"><Dialog.Title className="mb-4 text-lg font-semibold">{editor ? "Editar" : "Crear"} {label}</Dialog.Title>
            {editor !== undefined && (tab === "branches" ? <BranchOfficeForm offices={[office]} submitLabel="Guardar banca" cancelHref={back} onSubmitTo={endpoint(editor)} method={editor ? "put" : "post"} initialValues={{ ...editor, office_id: String(office.id) }} onSaved={() => setEditor(undefined)} onCancel={() => setEditor(undefined)} /> : tab === "users" ? <UserForm options={{ roles: management.roleOptions, branchOffices: branches.map((b: any) => ({ ...b, office_name: office.name })) }} submitLabel="Guardar usuario" cancelHref={back} onSubmitTo={endpoint(editor)} method={editor ? "put" : "post"} passwordOptional={!!editor} initialValues={editor ? { name: editor.name, email: editor.email, role_ids: editor.roles.map((r: any) => r.id), branch_office_ids: editor.branch_offices.map((b: any) => b.id), default_branch_office_id: String(editor.active_branch_office_id ?? "") } : undefined} onSaved={() => setEditor(undefined)} onCancel={() => setEditor(undefined)} /> : <RoleForm permissions={management.permissions} submitLabel="Guardar rol" cancelHref={back} onSubmitTo={endpoint(editor)} method={editor ? "put" : "post"} initialValues={editor ?? undefined} onSaved={() => setEditor(undefined)} onCancel={() => setEditor(undefined)} />)}
        </div></Modal>
        <Modal show={!!deleting} onClose={() => setDeleting(null)} closeable={!busy} maxWidth="md"><div className="space-y-4 p-6"><Dialog.Title className="text-lg font-semibold">Eliminar {label}</Dialog.Title><p>¿Eliminar «{deleting?.name}»?</p>{error && <p role="alert" className="text-red-500">{error}</p>}<div className="flex justify-end gap-2"><button disabled={busy} className={secondary} onClick={() => setDeleting(null)}>Cancelar</button><button disabled={busy} className={`${button} !bg-red-700`} onClick={() => { setBusy(true); router.delete(endpoint(deleting), { preserveScroll: true, onSuccess: () => setDeleting(null), onError: errors => setError(Object.values(errors).join(" ")), onFinish: () => setBusy(false) }); }}>Eliminar</button></div></div></Modal>
    </section>;
}
