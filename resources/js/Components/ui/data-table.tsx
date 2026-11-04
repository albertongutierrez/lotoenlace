import ComboboxSelect from "@/Components/ComboboxSelect";
import LoadingSkeleton from "@/Components/LoadingSkeleton";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTable, tableFeatures, columnVisibilityFeature, type RowData, rowPaginationFeature, rowSortingFeature, createPaginatedRowModel, createSortedRowModel, sortFn_alphanumeric, sortFn_basic, type ColumnDef } from "@tanstack/react-table";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";

const features = tableFeatures({ columnVisibilityFeature, rowPaginationFeature, rowSortingFeature, paginatedRowModel: createPaginatedRowModel(), sortedRowModel: createSortedRowModel(), sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic } });
export type DataColumn<T extends RowData> = ColumnDef<typeof features, T>;
const control = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800";

export function DataTable<T extends RowData>({ data, columns, loading = false, emptyMessage = "No hay resultados.", resetKey, paginate = true, getRowId, serverPage, onPageChange, fillHeight = false, footerNote }: { footerNote?: string; fillHeight?: boolean; loading?: boolean; data: T[]; columns: DataColumn<T>[]; emptyMessage?: string; resetKey?: string; paginate?: boolean; getRowId?: (row: T, index: number) => string; serverPage?: { from: number | null; to: number | null; total: number; links: { url: string | null; label: string; active: boolean }[] }; onPageChange?: (url: string) => void }) {
    const defaultColumn = useMemo(() => ({ sortFn: "alphanumeric" as const }), []);
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
    const table = useTable({ state: { pagination }, onPaginationChange: setPagination, features, data, columns, defaultColumn, manualPagination: !!serverPage || !paginate, getRowId });
    useEffect(() => { table.setPageIndex(0); }, [resetKey, data.length]);
    const { pageIndex, pageSize } = pagination;
    if (loading) return <LoadingSkeleton />;
    return <div className={fillHeight ? "flex h-full min-h-0 flex-col [&>[data-slot=table-container]]:min-h-0 [&>[data-slot=table-container]]:flex-1 [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:[scrollbar-width:thin] [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_th]:h-9 [&_td]:px-3 [&_td]:py-2" : undefined}>
        <Table><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id} className={header.column.id === "actions" ? "text-right" : undefined} aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : undefined}>
            {header.isPlaceholder ? null : header.column.getCanSort() ? <button className="inline-flex items-center gap-2 py-2 hover:text-emerald-600" onClick={header.column.getToggleSortingHandler()}><table.FlexRender header={header} />{header.column.getIsSorted() === "asc" ? <ArrowUp size={14} /> : header.column.getIsSorted() === "desc" ? <ArrowDown size={14} /> : <ArrowUpDown size={14} />}</button> : <table.FlexRender header={header} />}
        </TableHead>)}</TableRow>)}</TableHeader>
        <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id} className={cell.column.id === "actions" ? "text-right" : undefined}><table.FlexRender cell={cell} /></TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">{emptyMessage}</TableCell></TableRow>}</TableBody></Table>
        {serverPage && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm dark:border-slate-800">
            <div className="text-xs text-slate-500"><span>{serverPage.from ?? 0}–{serverPage.to ?? 0} de {serverPage.total} registros</span>{footerNote&&<span className="ml-3">{footerNote}</span>}</div>
            <nav aria-label="Paginación" className="flex flex-wrap gap-2">{serverPage.links.map((link, index) => <button key={index} className={`${control} ${link.active ? "font-semibold ring-1 ring-emerald-600" : ""}`} aria-current={link.active ? "page" : undefined} disabled={!link.url || link.active} onClick={() => link.url && onPageChange?.(link.url)}>{link.label.replace(/&laquo;/g, "«").replace(/&raquo;/g, "»").replace(/&amp;/g, "&")}</button>)}</nav>
        </div>}
        {paginate && !serverPage && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm dark:border-slate-800">
            <span className="text-slate-500" aria-live="polite">{data.length ? pageIndex * pageSize + 1 : 0}–{Math.min((pageIndex + 1) * pageSize, data.length)} de {data.length} registros</span>
            <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2">Filas por página<ComboboxSelect className={control} value={pageSize} onChange={e => table.setPageSize(Number(e.target.value))}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</ComboboxSelect></label><span>Página {pageIndex + 1} de {Math.max(1, table.getPageCount())}</span><button className={control} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Anterior</button><button className={control} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Siguiente</button></div>
        </div>}
    </div>;
}
