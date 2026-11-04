import ComboboxSelect from "@/Components/ComboboxSelect";
import BackLink from "@/Components/BackLink";

import InputError from "@/Components/InputError";

import PrimaryButton from "@/Components/PrimaryButton";

import TextInput from "@/Components/TextInput";

import { formatDominicanDocument } from "@/lib/formatters";

import { Link, useForm } from "@inertiajs/react";

import { Building2, ImagePlus, Save, Trash2, X } from "lucide-react";

import { FormEventHandler, useEffect, useMemo } from "react";

export type OfficeFormData = {
    _method?: "put";

    name: string;

    currency: string;

    slogan: string;

    tax_id: string;

    logo: File | null;

    compact_logo: File | null;

    show_print_company_details: boolean;

    remove_logo: boolean;

    remove_compact_logo: boolean;
};

type Props = {
    submitLabel: string;

    cancelHref: string;

    onSubmitTo: string;

    method?: "post" | "put";

    initialValues?: Partial<OfficeFormData> & {
        logo_url?: string | null;
        compact_logo_url?: string | null;
    };
};

export default function OfficeForm({
    submitLabel,
    cancelHref,
    onSubmitTo,
    method = "post",
    initialValues,
}: Props) {
    const { data, setData, post, processing, errors } = useForm<OfficeFormData>(
        {
            _method: method === "put" ? "put" : undefined,

            name: initialValues?.name ?? "",

            currency: initialValues?.currency ?? "DOP",

            slogan: initialValues?.slogan ?? "",

            tax_id: formatDominicanDocument(initialValues?.tax_id ?? ""),

            logo: null,

            compact_logo: null,

            show_print_company_details:
                initialValues?.show_print_company_details ?? true,

            remove_logo: false,

            remove_compact_logo: false,
        },
    );

    const logoPreview = useMemo(() => {
        if (data.remove_logo) {
            return null;
        }

        if (data.logo) {
            return URL.createObjectURL(data.logo);
        }

        return initialValues?.logo_url ?? null;
    }, [data.logo, data.remove_logo, initialValues?.logo_url]);

    const compactLogoPreview = useMemo(() => {
        if (data.remove_compact_logo) {
            return null;
        }

        if (data.compact_logo) {
            return URL.createObjectURL(data.compact_logo);
        }

        return initialValues?.compact_logo_url ?? null;
    }, [
        data.compact_logo,
        data.remove_compact_logo,
        initialValues?.compact_logo_url,
    ]);

    useEffect(() => {
        return () => {
            if (logoPreview && data.logo) {
                URL.revokeObjectURL(logoPreview);
            }

            if (compactLogoPreview && data.compact_logo) {
                URL.revokeObjectURL(compactLogoPreview);
            }
        };
    }, [data.logo, data.compact_logo, logoPreview, compactLogoPreview]);

    const submit: FormEventHandler = (event) => {
        event.preventDefault();

        post(onSubmitTo, { forceFormData: true });
    };

    return (
        <form
            onSubmit={submit}
            className="space-y-6 rounded-md border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
            <label className="mb-4 block text-sm">
                Moneda del consorcio
                <ComboboxSelect
                    className="mt-1 block rounded-md border-slate-300 dark:bg-slate-900"
                    disabled={method === "put"}
                    value={data.currency}
                    onChange={(e) => setData("currency", e.target.value)}
                >
                    {["DOP", "USD", "EUR", "HTG"].map((c) => (
                        <option key={c}>{c}</option>
                    ))}
                </ComboboxSelect>
            </label>

            <div className="grid gap-5 xl:grid-cols-[1fr_460px]">
                <div className="grid content-start gap-5 md:grid-cols-2">
                    <div>
                        <label
                            htmlFor="name"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                        >
                            Nombre interno
                        </label>

                        <TextInput
                            id="name"
                            value={data.name}
                            onChange={(event) =>
                                setData("name", event.target.value)
                            }
                            className="mt-2 block w-full"
                            isFocused
                        />

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Se usa para identificar la consorcio dentro del
                            sistema.
                        </p>

                        <InputError message={errors.name} className="mt-2" />
                    </div>

                    <div>
                        <label
                            htmlFor="tax_id"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                        >
                            RNC / Cedula
                        </label>

                        <TextInput
                            id="tax_id"
                            inputMode="numeric"
                            value={data.tax_id}
                            onChange={(event) =>
                                setData(
                                    "tax_id",
                                    formatDominicanDocument(event.target.value),
                                )
                            }
                            className="mt-2 block w-full"
                        />

                        <InputError message={errors.tax_id} className="mt-2" />
                    </div>

                    <div className="md:col-span-2">
                        <label
                            htmlFor="slogan"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                        >
                            Slogan
                        </label>

                        <TextInput
                            id="slogan"
                            value={data.slogan}
                            onChange={(event) =>
                                setData("slogan", event.target.value)
                            }
                            className="mt-2 block w-full"
                        />

                        <InputError message={errors.slogan} className="mt-2" />
                    </div>

                    <label className="md:col-span-2 flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                        <input
                            type="checkbox"

                            checked={data.show_print_company_details}

                            onChange={(event) =>
                                setData(
                                    "show_print_company_details",
                                    event.target.checked,
                                )
                            }

                            className="mt-0.5 rounded border-slate-300 text-emerald-600 shadow-sm focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900"
                        />

                        <span>
                            <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                                Mostrar datos de consorcio en documentos
                            </span>

                            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                                Desactívalo para imprimir sin nombre, RNC,
                                slogan, dirección, contactos, correo ni logo de
                                la consorcio.
                            </span>
                        </span>
                    </label>

                    <InputError
                        message={errors.show_print_company_details}
                        className="md:col-span-2"
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <LogoPicker
                        title="Logo 1"

                        description="Logo completo para documentos, reportes e impresion."

                        preview={logoPreview}

                        emptyClassName="h-14 w-14"

                        canRemove={Boolean(
                            logoPreview || data.logo || initialValues?.logo_url,
                        )}

                        onChange={(file) => {
                            setData({
                                ...data,
                                logo: file,
                                remove_logo: false,
                            });
                        }}

                        onRemove={() =>
                            setData({ ...data, logo: null, remove_logo: true })
                        }

                        error={errors.logo}
                    />

                    <LogoPicker
                        title="Logo 2"

                        description="Logo compacto para sidebar y favicon. Si esta vacio se usa el logo 1."

                        preview={compactLogoPreview}

                        emptyClassName="h-10 w-10"

                        compact

                        emptyText="Opcional"

                        canRemove={Boolean(
                            compactLogoPreview ||
                            data.compact_logo ||
                            initialValues?.compact_logo_url,
                        )}

                        onChange={(file) => {
                            setData({
                                ...data,
                                compact_logo: file,
                                remove_compact_logo: false,
                            });
                        }}

                        onRemove={() =>
                            setData({
                                ...data,
                                compact_logo: null,
                                remove_compact_logo: true,
                            })
                        }

                        error={errors.compact_logo}
                    />
                </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:justify-end">
                <BackLink
                    href={cancelHref}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    <X className="h-4 w-4" />
                    Cancelar
                </BackLink>

                <PrimaryButton disabled={processing} className="gap-2">
                    <Save className="h-4 w-4" />

                    {submitLabel}
                </PrimaryButton>
            </div>
        </form>
    );
}

type LogoPickerProps = {
    title: string;

    description: string;

    preview: string | null;

    emptyClassName: string;

    compact?: boolean;

    emptyText?: string;

    canRemove?: boolean;

    onChange: (file: File | null) => void;

    onRemove: () => void;

    error?: string;
};

function LogoPicker({
    title,
    description,
    preview,
    emptyClassName,
    compact = false,
    emptyText,
    canRemove = false,
    onChange,
    onRemove,
    error,
}: LogoPickerProps) {
    return (
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <div>
                <div className="text-sm font-semibold text-slate-950 dark:text-white">
                    {title}
                </div>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {description}
                </p>
            </div>

            <div
                className={`${compact ? "aspect-square" : "aspect-[4/3]"} flex items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900`}
            >
                {preview ? (
                    <img
                        src={preview}
                        alt={title}
                        className="h-full w-full object-contain p-3"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-300 dark:text-slate-700">
                        <Building2 className={emptyClassName} />

                        {emptyText && (
                            <span className="text-xs font-semibold uppercase tracking-normal text-slate-400 dark:text-slate-600">
                                {emptyText}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="grid gap-2">
                <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                    <ImagePlus className="h-4 w-4" />
                    Seleccionar {title.toLowerCase()}
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) =>
                            onChange(event.target.files?.[0] ?? null)
                        }
                    />
                </label>

                {canRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                        <Trash2 className="h-4 w-4" />
                        Quitar {title.toLowerCase()}
                    </button>
                )}
            </div>

            <InputError message={error} />
        </div>
    );
}
