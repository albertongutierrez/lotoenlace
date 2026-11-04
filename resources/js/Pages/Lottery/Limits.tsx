import ComboboxSelect from "@/Components/ComboboxSelect";
import { RowActions } from "@/Components/ui/row-actions";
import { useState } from "react";
import { usePage } from "@inertiajs/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Modal from "@/Components/Modal";
import { Dialog } from "@headlessui/react";
import { DataTable, DataColumn } from "@/Components/ui/data-table";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { PageProps } from "@/types";
import {
    Shell,
    Field,
    Draw,
    input,
    button,
    secondary,
    panel,
    modes,
    drawName,
    money,
} from "./shared";

export default function Limits({ limits: initialLimits, branches, draws, currency }: any) {
    const blank = {
        name: "",
        branch_office_id: "",
        modality: "super_pale",
        category: "all",
        match_type: "exact",
        numbers: "",
        draw_ids: [],
        pairs: [],
        aggregation: "shared",
        amount_minor: 0,
        starts_on: "",
        ends_on: "",
        active: true,
    };
    const [form, setForm] = useState<any>(blank);
    const { auth } = usePage<PageProps>().props;
    const client = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState<any>(null);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [scopeFilter, setScopeFilter] = useState("all");
    const query = useQuery({ queryKey: ["lottery", "limits", auth.user.id, auth.activeBranchOffice?.id_hash], initialData: { limits: initialLimits }, queryFn: async ({ signal }) => (await axios.get("/lottery/limits", { signal, headers: { Accept: "application/json" } })).data });
    const limits = query.data.limits;
    const mutation = useMutation({ mutationFn: async ({ remove, data }: { remove?: boolean; data: any }) => remove ? axios.delete(`/lottery/limits/${data.id}`) : axios.post("/lottery/limits", { ...data, branch_office_id: data.branch_office_id || null, starts_on: data.starts_on || null, ends_on: data.ends_on || null }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["lottery"] }); setEditing(false); setDeleting(null); } });
    const busy = mutation.isPending;
    const openEditor = (record?: any) => { mutation.reset(); setPairA(""); setPairB(""); setForm(record ? { ...blank, ...record, starts_on: record.starts_on?.slice(0, 10) ?? "", ends_on: record.ends_on?.slice(0, 10) ?? "" } : blank); setEditing(true); };
    const error = mutation.error as any;
    const errorText = error?.response?.data?.errors ? Object.values(error.response.data.errors).flat().join(" ") : error?.response?.data?.message ?? "No se pudo guardar el cambio.";
    const rows = limits.filter((l: any) => `${l.name} ${l.numbers ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (status === "all" || l.active === (status === "active")) && (scopeFilter === "all" || (scopeFilter === "office" ? !l.branch_office_id : String(l.branch_office_id) === scopeFilter)));
    const columns: DataColumn<any>[] = [
        { accessorKey: "name", header: "Restricción" },
        { id: "scope", header: "Alcance", cell: ({ row: { original: l } }) => l.branch_office_id ? `Banca ${branches.find((b: any) => b.id === l.branch_office_id)?.code ?? l.branch_office_id}` : "Todo el consorcio" },
        { accessorKey: "modality", header: "Modalidad", cell: ({ row: { original: l } }) => l.modality === "all" ? "Todas" : modes[l.modality as keyof typeof modes] },
        { id: "bet", header: "Jugada / categoría", cell: ({ row: { original: l } }) => <div>{l.match_type === "all" ? "Todas las jugadas" : `${l.match_type === "contains" ? "Contiene " : ""}${l.numbers}`}<p className="text-xs text-slate-500">{l.category === "all" ? "Todas las categorías" : `Premio ${l.category}`}</p></div> },
        { accessorKey: "amount_minor", sortFn: "basic", header: "Límite", cell: ({ row: { original: l } }) => <div>{Number(l.amount_minor) === 0 ? <span className="text-red-500">Bloqueado</span> : money(l.amount_minor, currency)}<p className="text-xs text-slate-500">{l.aggregation === "shared" ? "Compartido" : "Por sorteo o pareja"}</p></div> },
        { id: "draws", header: "Sorteos / parejas", cell: ({ row: { original: l } }) => <span>{l.draw_ids?.length || l.pairs?.length ? `${l.draw_ids?.length ?? 0} sorteos · ${l.pairs?.length ?? 0} parejas` : "Todos"}</span> },
        { id: "dates", header: "Vigencia", cell: ({ row: { original: l } }) => `${l.starts_on?.slice(0, 10) || "Sin inicio"} / ${l.ends_on?.slice(0, 10) || "Sin vencimiento"}` },
        { accessorKey: "active", header: "Estado", sortFn: "basic", cell: ({ row }) => <span className={row.original.active ? "text-emerald-600" : "text-slate-500"}>{row.original.active ? "Activa" : "Inactiva"}</span> },
        { id: "actions", header: "Acciones", cell: ({ row }) => <RowActions label={row.original.name} actions={[
            { label: "Editar", icon: Pencil, onClick: () => openEditor(row.original) },
            { label: "Eliminar", icon: Trash2, destructive: true, onClick: () => { mutation.reset(); setDeleting(row.original); } },
        ]} /> },
    ];
    const [pairA, setPairA] = useState("");
    const [pairB, setPairB] = useState("");
    const set = (k: string, v: any) => setForm({ ...form, [k]: v });
    return (
        <Shell fullWidth title="Bloqueos y límites">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Administra restricciones del consorcio y excepciones por banca. Un máximo de cero bloquea la jugada.</p><button className={`${button} inline-flex items-center gap-2`} onClick={() => openEditor()}><Plus size={16} aria-hidden />Nueva restricción</button></div>
            <section className={`${panel} !p-0 overflow-hidden`}>
                <div className="flex flex-wrap gap-3 p-4"><input className={`${input} flex-1`} aria-label="Buscar restricción" placeholder="Buscar por nombre o jugada…" value={search} onChange={e => setSearch(e.target.value)} /><ComboboxSelect className={`${input} !w-auto`} aria-label="Estado" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="active">Activas</option><option value="inactive">Inactivas</option></ComboboxSelect><ComboboxSelect className={`${input} !w-auto`} aria-label="Alcance" value={scopeFilter} onChange={e => setScopeFilter(e.target.value)}><option value="all">Todos los alcances</option><option value="office">Consorcio completo</option>{branches.map((b: any) => <option key={b.id} value={String(b.id)}>Banca {b.code}</option>)}</ComboboxSelect></div>
                {query.isError && <p role="alert" className="p-4 text-red-500">No se pudo actualizar la lista. <button onClick={() => query.refetch()}>Reintentar</button></p>}
                <DataTable loading={query.isLoading} data={rows} columns={columns} getRowId={row => String(row.id)} resetKey={`${search}:${status}:${scopeFilter}`} emptyMessage="No hay restricciones que coincidan." />
            </section>
            <Modal show={editing} onClose={() => setEditing(false)} closeable={!busy}>
                <div className="max-h-[85dvh] overflow-y-auto p-6">
                    <Dialog.Title className="mb-4 text-lg font-semibold">{form.id ? "Editar restricción" : "Nueva restricción"}</Dialog.Title>
                    {mutation.isError && <p role="alert" className="mb-4 text-sm text-red-500">{errorText}</p>}
                    <form
                        className="space-y-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            mutation.mutate({ data: form });
                        }}
                    >
                        <Field label="Nombre">
                            <input
                                className={input}
                                required
                                value={form.name}
                                onChange={(e) => set("name", e.target.value)}
                            />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Alcance">
                                <ComboboxSelect
                                    className={input}
                                    value={form.branch_office_id ?? ""}
                                    onChange={(e) =>
                                        set("branch_office_id", e.target.value)
                                    }
                                >
                                    <option value="">Todo el consorcio</option>
                                    {branches.map((b: any) => (
                                        <option key={b.id} value={b.id}>
                                            {b.code} · {b.name}
                                        </option>
                                    ))}
                                </ComboboxSelect>
                            </Field>
                            <Field label="Modalidad">
                                <ComboboxSelect
                                    className={input}
                                    value={form.modality}
                                    onChange={(e) =>
                                        set("modality", e.target.value)
                                    }
                                >
                                    <option value="all">Todas</option>
                                    {Object.entries(modes).map(([k, v]) => (
                                        <option key={k} value={k}>
                                            {v}
                                        </option>
                                    ))}
                                </ComboboxSelect>
                            </Field>
                            <Field label="Categoría de premio">
                                <ComboboxSelect
                                    className={input}
                                    value={form.category}
                                    onChange={(e) =>
                                        set("category", e.target.value)
                                    }
                                >
                                    {[
                                        "all",
                                        "1",
                                        "2",
                                        "3",
                                        "1-1",
                                        "1-2",
                                        "1-3",
                                        "2-3",
                                    ].map((v) => (
                                        <option key={v} value={v}>
                                            {v === "all"
                                                ? "Todas las aplicables"
                                                : v}
                                        </option>
                                    ))}
                                </ComboboxSelect>
                            </Field>
                            <Field label="Coincidencia">
                                <ComboboxSelect
                                    className={input}
                                    value={form.match_type}
                                    onChange={(e) =>
                                        set("match_type", e.target.value)
                                    }
                                >
                                    <option value="exact">Jugada exacta</option>
                                    <option value="contains">
                                        Contiene el número
                                    </option>
                                    <option value="all">
                                        Todas las jugadas
                                    </option>
                                </ComboboxSelect>
                            </Field>
                            {form.match_type !== "all" && (
                                <Field label="Número o combinación">
                                    <input
                                        className={input}
                                        placeholder="10–20 (usar guion -)"
                                        value={form.numbers ?? ""}
                                        onChange={(e) =>
                                            set("numbers", e.target.value)
                                        }
                                    />
                                </Field>
                            )}
                            <Field
                                label={`Máximo apostado (${currency}) · 0 bloquea`}
                            >
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className={input}
                                    value={form.amount_minor / 100}
                                    onChange={(e) =>
                                        set(
                                            "amount_minor",
                                            Math.round(
                                                Number(e.target.value) * 100,
                                            ),
                                        )
                                    }
                                />
                            </Field>
                            <Field label="Acumulación">
                                <ComboboxSelect
                                    className={input}
                                    value={form.aggregation}
                                    onChange={(e) =>
                                        set("aggregation", e.target.value)
                                    }
                                >
                                    <option value="shared">
                                        Cupo compartido
                                    </option>
                                    <option value="separate">
                                        Por sorteo o pareja
                                    </option>
                                </ComboboxSelect>
                            </Field>
                            <Field label="Desde · vacío: todos los días">
                                <input
                                    className={input}
                                    type="date"
                                    value={form.starts_on ?? ""}
                                    onChange={(e) =>
                                        set("starts_on", e.target.value)
                                    }
                                />
                            </Field>
                            <Field label="Hasta · vacío: sin vencimiento">
                                <input
                                    className={input}
                                    type="date"
                                    value={form.ends_on ?? ""}
                                    onChange={(e) =>
                                        set("ends_on", e.target.value)
                                    }
                                />
                            </Field>
                        </div>
                        <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                            <summary className="cursor-pointer text-sm font-semibold">
                                Restringir sorteos · sin selección aplica a
                                todos
                            </summary>
                            <div className="mt-3 grid gap-2">
                                {draws.map((d: Draw) => (
                                    <label
                                        className="flex gap-2 text-sm"
                                        key={d.id}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={(
                                                form.draw_ids ?? []
                                            ).includes(d.id)}
                                            onChange={(e) =>
                                                set(
                                                    "draw_ids",
                                                    e.target.checked
                                                        ? [
                                                              ...(form.draw_ids ??
                                                                  []),
                                                              d.id,
                                                          ]
                                                        : (
                                                              form.draw_ids ??
                                                              []
                                                          ).filter(
                                                              (id: number) =>
                                                                  id !== d.id,
                                                          ),
                                                )
                                            }
                                        />
                                        {drawName(d)}
                                    </label>
                                ))}
                            </div>
                            <p className="mt-3 text-xs text-slate-500">
                                Para súper palé, coincide si cualquiera de los
                                dos sorteos está seleccionado.
                            </p>
                        </details>
                        <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                            <summary className="cursor-pointer text-sm font-semibold">
                                Restringir parejas exactas
                            </summary>
                            <div className="mt-3 flex gap-2">
                                {[
                                    [pairA, setPairA],
                                    [pairB, setPairB],
                                ].map(([v, s]: any, i) => (
                                    <ComboboxSelect
                                        key={i}
                                        className={input}
                                        value={v}
                                        onChange={(e) => s(e.target.value)}
                                    >
                                        <option value="">Sorteo {i + 1}</option>
                                        {draws
                                            .filter((d: Draw) =>
                                                d.modalities.includes(
                                                    "super_pale",
                                                ),
                                            )
                                            .map((d: Draw) => (
                                                <option key={d.id} value={d.id}>
                                                    {drawName(d)}
                                                </option>
                                            ))}
                                    </ComboboxSelect>
                                ))}
                                <button
                                    type="button"
                                    className={secondary}
                                    onClick={() => {
                                        if (pairA && pairB && pairA !== pairB)
                                            set(
                                                "pairs",
                                                Array.from(
                                                    new Set([
                                                        ...(form.pairs ?? []),
                                                        [
                                                            Number(pairA),
                                                            Number(pairB),
                                                        ]
                                                            .sort(
                                                                (a, b) => a - b,
                                                            )
                                                            .join("-"),
                                                    ]),
                                                ),
                                            );
                                    }}
                                >
                                    Añadir
                                </button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {(form.pairs ?? []).map((p: string) => (
                                    <button
                                        type="button"
                                        className={secondary}
                                        key={p}
                                        onClick={() =>
                                            set(
                                                "pairs",
                                                form.pairs.filter(
                                                    (v: string) => v !== p,
                                                ),
                                            )
                                        }
                                    >
                                        {p
                                            .split("-")
                                            .map(
                                                (id) =>
                                                    draws.find(
                                                        (d: Draw) =>
                                                            d.id === Number(id),
                                                    )?.name ?? id,
                                            )
                                            .join(" + ")}{" "}
                                        ×
                                    </button>
                                ))}
                            </div>
                        </details>
                        <p className="text-xs text-slate-500">
                            Los límites usan el monto jugado antes del
                            descuento. Las restricciones generales y específicas
                            se aplican juntas.
                        </p>
                        <label className="flex gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={form.active}
                                onChange={(e) =>
                                    set("active", e.target.checked)
                                }
                            />
                            Restricción activa
                        </label>
                        <div className="flex gap-2">
                            <button disabled={busy} className={button}>
                                <Save size={16} className="inline-block mr-2" aria-hidden />Guardar restricción
                            </button>
                            <button
                                type="button"
                                className={secondary}
                                onClick={() => setEditing(false)}
                            >
                                <X size={16} className="inline-block mr-2" aria-hidden />Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>
            <Modal show={!!deleting} onClose={() => setDeleting(null)} closeable={!busy} maxWidth="md"><div className="space-y-4 p-6"><Dialog.Title className="text-lg font-semibold">Eliminar restricción</Dialog.Title><p>¿Eliminar «{deleting?.name}»? Dejará de aplicarse a las nuevas ventas. El cambio quedará registrado en la auditoría.</p>{mutation.isError && <p role="alert" className="text-red-500">{errorText}</p>}<div className="flex justify-end gap-2"><button className={secondary} disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className={`${button} !bg-red-700 inline-flex items-center gap-2`} disabled={busy} onClick={() => mutation.mutate({ remove: true, data: deleting })}><Trash2 size={16} aria-hidden />Eliminar</button></div></div></Modal>
        </Shell>
    );
}
