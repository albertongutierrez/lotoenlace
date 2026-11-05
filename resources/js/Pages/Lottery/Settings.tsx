import ComboboxSelect from "@/Components/ComboboxSelect";
import PaymentMethodsEditor from "./PaymentMethodsEditor";
import TariffRulesEditor from "./TariffRulesEditor";
import ConsortiumManagement from "./ConsortiumManagement";
import { ArrowLeft, Building2, Settings2, Ticket, Trophy, GitMerge, Store, Users, RotateCcw, Plus, Pencil, Save } from "lucide-react";
import OfficeForm from "@/Pages/Settings/Offices/OfficeForm";
import { usePage } from "@inertiajs/react";
import { PageProps } from "@/types";
import { useState } from "react";
import { Link, router } from "@inertiajs/react";
import {
    Shell,
    Field,
    Draw,
    input,
    button,
    secondary,
    panel,
    drawName,
} from "./shared";

export default function Settings({
    office,
    branch: initialBranch,
    management,
    branches,
    effective,
    defaults,
    draws,
}: any) {
    const { auth } = usePage<PageProps>().props;
    const errors = usePage().props.errors;
    const can = (permission: string) => !!auth.user.is_super_admin || !!auth.user.permissions?.includes(permission);
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(initialBranch?.id ?? null);
    const branch = branches.find((b: any) => b.id === selectedBranchId) ?? null;
    const tabIcons = { details: Building2, general: Settings2, draws: Ticket, rules: Trophy, pairs: GitMerge, branches: Store, users: Users, roles: Users };
    const [scope, setScope] = useState("office");
    const [tab, setTab] = useState(new URLSearchParams(window.location.search).get("tab") || "details");
    const [settings, setSettings] = useState<any>(
        office.lottery_settings ?? {},
    );
    const [currency, setCurrency] = useState(office.currency);
    const [busy, setBusy] = useState(false);
    const [pairScope, setPairScope] = useState("general");
    const [pairA, setPairA] = useState("");
    const [pairB, setPairB] = useState("");
    const parent =
        scope === "office"
            ? defaults
            : { ...defaults, ...office.lottery_settings };
    const value = (k: string) => settings[k] ?? parent[k];
    const update = (k: string, v: any) => setSettings({ ...settings, [k]: v });
    const inherit = (k: string) =>
        setSettings((s: any) => {
            const copy = { ...s };
            delete copy[k];
            return copy;
        });
    const allowed =
        scope === "office"
            ? draws
            : draws.filter((d: Draw) =>
                  (office.lottery_settings?.draw_ids ?? []).includes(d.id),
              );
    const pairKey = [Number(pairA), Number(pairB)]
        .sort((a, b) => a - b)
        .join("-");
    const generalPair = tab === "pairs" && pairScope === "general";
    const parentRule = generalPair ? (parent.super_pale ?? {})
        : { ...parent.super_pale, ...parent.pairs?.[pairKey], ...settings.super_pale };
    const ownRule = generalPair ? (settings.super_pale ?? {}) : (settings.pairs?.[pairKey] ?? {});
    const rule = { ...parentRule, ...ownRule };
    const setRule = (r: any) =>
        generalPair ? update("super_pale", r) : update("pairs", { ...settings.pairs, [pairKey]: r });
    const category = ["1-1", "1-2", "1-3"];
    return (
        <Shell fullWidth title={office.name}>
            {auth.user.is_super_admin && <div className="flex"><Link className={`${secondary} inline-flex items-center gap-2`} href="/settings/offices"><ArrowLeft size={16} aria-hidden />Volver a consorcios</Link></div>}
            <div className="flex flex-wrap gap-2">
                {[
                    ["details", "Datos básicos"],
                    ["general", "Configuración"],
                    ["draws", "Sorteos"],
                    ["rules", "Comisiones y premios"],
                    ["pairs", "Súper palé"],
                    ["branches", "Bancas"],
                    ["users", "Usuarios"],
                    ["roles", "Roles y permisos"],
                ].filter(([k]) => k === "users" ? can("users.view") : k === "roles" ? can("roles.view") : k === "branches" ? can("settings.branch-offices.view") : true).map(([k, l]) => {
                    const Icon = tabIcons[k as keyof typeof tabIcons];
                    return (
                    <button
                        key={k}
                        className={`${tab === k ? button : secondary} inline-flex items-center gap-2`}
                        onClick={() => setTab(k)}
                    >
                        <Icon size={16} aria-hidden />{l}
                    </button>
                ); })}

            </div>
            {tab === "details" && <OfficeForm
                key={office.id}
                submitLabel="Guardar datos del consorcio"
                cancelHref={route("lottery.settings.consortium", office.id_hash)}
                onSubmitTo={route("lottery.settings.details", office.id_hash)}
                method="put"
                initialValues={{ name: office.name, currency: office.currency, slogan: office.slogan ?? "", tax_id: office.tax_id ?? "", show_print_company_details: office.show_print_company_details, logo_url: office.logo_url, compact_logo_url: office.compact_logo_url }}
            />}
            {["branches", "users", "roles"].includes(tab) && can(tab === "branches" ? "settings.branch-offices.view" : `${tab}.view`) && <ConsortiumManagement key={`${office.id}:${tab}`} tab={tab} office={office} branches={branches} management={management} configure={(b: any) => { setSelectedBranchId(b.id); setScope("branch"); setSettings(b.lottery_settings ?? {}); setTab("general"); }} />}
            <section className={`${panel} ${["details", "branches", "users", "roles"].includes(tab) ? "hidden" : ""}`}>
                <div className="mb-6 flex flex-wrap items-center gap-4">
                    <Field label="Configurar">
                        <ComboboxSelect
                            className={input}
                            value={scope === "office" ? "office" : String(selectedBranchId)}
                            onChange={(e) => {
                                const selected = branches.find((b: any) => String(b.id) === e.target.value);
                                setScope(selected ? "branch" : "office");
                                setSelectedBranchId(selected?.id ?? null);
                                setSettings(selected ? (selected.lottery_settings ?? {}) : (office.lottery_settings ?? {}));
                            }}
                        >
                            <option value="office">
                                Consorcio · valores heredados por las bancas
                            </option>
                            {branches.map((b: any) => <option key={b.id} value={String(b.id)}>Banca {b.code} · {b.name || "Sin nombre"} · excepciones propias</option>)}
                        </ComboboxSelect>
                    </Field>
                    <span className="text-sm text-slate-500">
                        Moneda única: {office.currency}
                    </span>
                </div>
                {tab === "general" && (
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        <PaymentMethodsEditor key={`${scope}:${selectedBranchId}`} settings={settings} parent={parent} branch={scope === 'branch'} disabled={!can('lottery.payments.configure')} errors={errors} onChange={setSettings} />
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40 md:col-span-2 xl:col-span-3">
                            <Field label="Forma de cuadre">
                                <ComboboxSelect aria-label="Forma de cuadre" className={input} disabled={!can("lottery.reconciliation.configure")} value={scope === "branch" ? (settings.reconciliation_mode ?? "") : value("reconciliation_mode")}
                                    onChange={event => event.target.value === "" ? inherit("reconciliation_mode") : update("reconciliation_mode", event.target.value)}>
                                    {scope === "branch" && <option value="">Heredar del consorcio · {parent.reconciliation_mode === "report" ? "Cuadre por reporte" : "Cajas con apertura y cierre"}</option>}
                                    <option value="cash">Cajas · apertura y cierre obligatorios</option>
                                    <option value="report">Reporte · cuadre por banca y período, sin abrir caja</option>
                                </ComboboxSelect>
                            </Field>
                            <p className="mt-2 text-xs text-slate-500">Con cajas, las ventas, anulaciones y pagos requieren una caja abierta. Con reporte, se opera sin apertura y el cuadre se consulta en Reportes por consorcio, banca y período. Cada banca puede heredar o tener una excepción. Cierra primero las cajas abiertas antes de cambiar; el historial se conserva y el cambio queda auditado.</p>
                            {!can("lottery.reconciliation.configure") && <p className="mt-2 text-xs text-amber-600">Requiere el permiso «Elegir forma de cuadre por consorcio y banca».</p>}
                            {errors["settings.reconciliation_mode"] && <p role="alert" className="mt-2 text-sm text-red-500">{errors["settings.reconciliation_mode"]}</p>}
                        </div>
                        {scope === "office" && (
                            <Field label="Moneda del consorcio">
                                <ComboboxSelect
                                    className={input}
                                    value={currency}
                                    onChange={(e) =>
                                        setCurrency(e.target.value)
                                    }
                                >
                                    {["DOP", "USD", "EUR", "HTG"].map((c) => (
                                        <option key={c}>{c}</option>
                                    ))}
                                </ComboboxSelect>
                            </Field>
                        )}
                        {[
                            ["daily_limit_minor", "Límite diario por banca"],
                            ...(scope === "office"
                                ? [
                                      [
                                          "consortium_limit_minor",
                                          "Límite diario compartido",
                                      ],
                                  ]
                                : []),
                            ["cancel_minutes", "Minutos para anular"],
                            [
                                "reprint_minutes",
                                "Minutos para reimprimir · futuro módulo",
                            ],
                            [
                                "discount_every_minor",
                                "Descuento: por cada monto jugado",
                            ],
                            [
                                "discount_amount_minor",
                                "Descuento: monto a descontar",
                            ],
                        ].map(([k, l]) => (
                            <div key={k}>
                                <Field label={l}>
                                    <input
                                        className={input}
                                        type="number"
                                        min="0"
                                        step={
                                            k.endsWith("minor") ? "0.01" : "1"
                                        }
                                        placeholder={
                                            value(k) == null
                                                ? "Sin límite"
                                                : String(
                                                      value(k) /
                                                          (k.endsWith("minor")
                                                              ? 100
                                                              : 1),
                                                  )
                                        }
                                        value={
                                            settings[k] == null
                                                ? ""
                                                : settings[k] /
                                                  (k.endsWith("minor")
                                                      ? 100
                                                      : 1)
                                        }
                                        onChange={(e) =>
                                            update(
                                                k,
                                                e.target.value === ""
                                                    ? null
                                                    : Math.round(
                                                          Number(
                                                              e.target.value,
                                                          ) *
                                                              (k.endsWith(
                                                                  "minor",
                                                              )
                                                                  ? 100
                                                                  : 1),
                                                      ),
                                            )
                                        }
                                    />
                                </Field>
                                {scope === "branch" && (
                                    <button
                                        className="mt-1 text-xs text-emerald-700"
                                        onClick={() => inherit(k)}
                                    >
                                        <RotateCcw size={16} aria-hidden className="inline-block mr-1" />Usar valor del consorcio
                                    </button>
                                )}
                            </div>
                        ))}
                        {["discount_enabled", "show_qr"].map((k) => (
                            <Field
                                key={k}
                                label={
                                    k === "show_qr"
                                        ? "Mostrar QR en el ticket"
                                        : "Descuento habilitado"
                                }
                            >
                                <ComboboxSelect
                                    className={input}
                                    value={
                                        settings[k] === undefined
                                            ? "inherit"
                                            : String(settings[k])
                                    }
                                    onChange={(e) =>
                                        e.target.value === "inherit"
                                            ? inherit(k)
                                            : update(
                                                  k,
                                                  e.target.value === "true",
                                              )
                                    }
                                >
                                    <option value="inherit">
                                        {scope === "branch"
                                            ? "Heredar"
                                            : "Predeterminado"}{" "}
                                        ({value(k) ? "Sí" : "No"})
                                    </option>
                                    <option value="true">Sí</option>
                                    <option value="false">No</option>
                                </ComboboxSelect>
                            </Field>
                        ))}
                        <Field label="Pie de ticket">
                            <textarea
                                className={input}
                                value={settings.footer ?? ""}
                                placeholder={
                                    parent.footer || "Gracias por jugar"
                                }
                                onChange={(e) =>
                                    update("footer", e.target.value)
                                }
                            />
                            {scope === "branch" && (
                                <button
                                    onClick={() => inherit("footer")}
                                    className="text-xs text-emerald-700"
                                >
                                    <RotateCcw size={16} aria-hidden className="inline-block mr-1" />Heredar pie del consorcio
                                </button>
                            )}
                        </Field>
                    </div>
                )}
                {tab === "draws" && (
                    <>
                        <p className="mb-4 text-sm text-slate-500">
                            Las bancas solo pueden vender sorteos autorizados
                            por el consorcio.
                        </p>
                        {scope === "branch" && (
                            <button
                                className={`${secondary} inline-flex items-center gap-2`}
                                onClick={() => inherit("draw_ids")}
                            >
                                <RotateCcw size={16} aria-hidden />Heredar selección completa
                            </button>
                        )}
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {allowed.map((d: Draw) => (
                                <label
                                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                                    key={d.id}
                                >
                                    <input
                                        type="checkbox"
                                        checked={(
                                            value("draw_ids") ?? []
                                        ).includes(d.id)}
                                        onChange={(e) =>
                                            update(
                                                "draw_ids",
                                                e.target.checked
                                                    ? [
                                                          ...(value(
                                                              "draw_ids",
                                                          ) ?? []),
                                                          d.id,
                                                      ]
                                                    : (
                                                          value("draw_ids") ??
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
                    </>
                )}
                {tab === "rules" && (
                    <TariffRulesEditor key={`${scope}:${selectedBranchId}`} settings={settings} parent={parent} draws={allowed} branch={scope === "branch"} onChange={setSettings} />
                )}
                {tab === "pairs" && (
                    <div className="space-y-5">
                        <Field label="Aplicar configuración">
                            <ComboboxSelect className={input} value={pairScope} onChange={e => setPairScope(e.target.value)}>
                                <option value="general">General · todas las parejas</option>
                                <option value="pair">Excepción para una pareja</option>
                            </ComboboxSelect>
                        </Field>
                        <p className="text-sm text-slate-500">La configuración general del consorcio se hereda en las bancas. Una configuración general propia de la banca se aplica solo a esa banca. Las excepciones propias por pareja tienen prioridad. Una banca no puede habilitar parejas deshabilitadas por el consorcio.</p>
                        {!generalPair && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                {[
                                    [pairA, setPairA, "Sorteo A"],
                                    [pairB, setPairB, "Sorteo B"],
                                ].map(([v, set, l]: any) => (
                                    <Field key={l} label={l}>
                                        <ComboboxSelect
                                            className={input}
                                            value={v}
                                            onChange={(e) =>
                                                set(e.target.value)
                                            }
                                        >
                                            <option value="">
                                                Seleccionar
                                            </option>
                                            {allowed
                                                .filter((d: Draw) =>
                                                    d.modalities.includes(
                                                        "super_pale",
                                                    ),
                                                )
                                                .map((d: Draw) => (
                                                    <option
                                                        key={d.id}
                                                        value={d.id}
                                                    >
                                                        {drawName(d)}
                                                    </option>
                                                ))}
                                        </ComboboxSelect>
                                    </Field>
                                ))}
                            </div>
                        )}
                        {(generalPair || (!!pairA && !!pairB && pairA !== pairB)) && (
                            <>
                                <p className="text-sm text-slate-500">
                                    Premios por cada unidad apostada. Una
                                    categoría vacía no participa. Comisión
                                    vacía: sin comisión o heredada. Si coinciden
                                    varias categorías, se paga la mayor.
                                </p>
                                {tab === "pairs" && (
                                    <div className="flex flex-wrap gap-5">
                                        <label className="flex gap-2">
                                            <input
                                                type="checkbox"
                                                checked={rule.enabled ?? false}
                                                onChange={(e) =>
                                                    setRule({
                                                        ...ownRule,
                                                        enabled:
                                                            e.target.checked,
                                                    })
                                                }
                                            />
                                            {generalPair ? "Habilitar todas las parejas permitidas" : "Pareja habilitada"}
                                        </label>
                                        <label className="flex gap-2">
                                            <input
                                                type="checkbox"
                                                checked={rule.ordered ?? false}
                                                onChange={(e) =>
                                                    setRule({
                                                        ...ownRule,
                                                        ordered:
                                                            e.target.checked,
                                                    })
                                                }
                                            />
                                            Cada número asignado al sorteo base
                                            y al otro sorteo
                                        </label>
                                    </div>
                                )}
                                {tab === "pairs" && !generalPair && (
                                    <Field label="Sorteo base · su primer premio se combina con el otro sorteo">
                                        <ComboboxSelect
                                            className={input}
                                            value={
                                                rule.primary_draw_id ??
                                                Math.min(
                                                    Number(pairA),
                                                    Number(pairB),
                                                )
                                            }
                                            onChange={(e) =>
                                                setRule({
                                                    ...ownRule,
                                                    primary_draw_id: Number(
                                                        e.target.value,
                                                    ),
                                                })
                                            }
                                        >
                                            {[pairA, pairB].map((id) => (
                                                <option key={id} value={id}>
                                                    {drawName(
                                                        draws.find(
                                                            (d: Draw) =>
                                                                d.id ===
                                                                Number(id),
                                                        ),
                                                    )}
                                                </option>
                                            ))}
                                        </ComboboxSelect>
                                    </Field>
                                )}
                                <div className="grid gap-4 sm:grid-cols-4">
                                    <Field label="Comisión sobre cobrado (%)">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.01"
                                            className={input}
                                            value={
                                                ownRule.commission_bps == null
                                                    ? ""
                                                    : ownRule.commission_bps /
                                                      100
                                            }
                                            placeholder={String(
                                                (parentRule.commission_bps ??
                                                    0) / 100,
                                            )}
                                            onChange={(e) =>
                                                setRule({
                                                    ...ownRule,
                                                    commission_bps:
                                                        e.target.value === ""
                                                            ? null
                                                            : Math.round(
                                                                  Number(
                                                                      e.target
                                                                          .value,
                                                                  ) * 100,
                                                              ),
                                                })
                                            }
                                        />
                                    </Field>
                                    {category.map((c) => (
                                        <Field key={c} label={`Premio ${c}`}>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1000000"
                                                step="1"
                                                className={input}
                                                value={rule.payouts?.[c] ?? ""}
                                                onChange={(e) => {
                                                    const p = {
                                                        ...rule.payouts,
                                                    };
                                                    if (e.target.value === "")
                                                        delete p[c];
                                                    else
                                                        p[c] = Number(
                                                            e.target.value,
                                                        );
                                                    setRule({
                                                        ...ownRule,
                                                        payouts: p,
                                                    });
                                                }}
                                            />
                                        </Field>
                                    ))}
                                </div>
                                {scope === "branch" && (
                                    <button
                                        className={`${secondary} inline-flex items-center gap-2`}
                                        onClick={() => {
                                            if (generalPair) { inherit("super_pale"); return; }
                                            const copy = { ...settings.pairs };
                                            delete copy[pairKey];
                                            update("pairs", copy);
                                        }}
                                    >
                                        <RotateCcw size={16} aria-hidden className="inline-block mr-1" />Heredar esta tabla del consorcio
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
                {tab !== "branches" && (
                    <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
                        <button
                            className={`${button} inline-flex items-center gap-2`}
                            disabled={busy}
                            onClick={() => {
                                setBusy(true);
                                router.post(
                                    "/lottery/settings",
                                    {
                                        branch_id: branch?.id,
                                        office_id: office.id,
                                        scope,
                                        currency,
                                        settings,
                                    },
                                    { onFinish: () => setBusy(false) },
                                );
                            }}
                        >
                            <Save size={16} aria-hidden />Guardar configuración
                        </button>
                    </div>
                )}
            </section>
        </Shell>
    );
}
