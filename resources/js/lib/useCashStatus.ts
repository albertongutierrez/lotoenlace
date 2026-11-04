import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { subscribeCashStatus, type CashConnection } from "./cashRealtime";

type CashStatus = { reconciliation_mode?: "cash" | "report"; current: { id: number; opened_by?: number; created_at?: string } | null };

export function useCashStatus(branchId: number, officeId: number, userId: number, initialMode: "cash" | "report" = "cash") {
    const client = useQueryClient();
    const [connection, setConnection] = useState<CashConnection>("disabled");
    const [notice, setNotice] = useState("");
    const query = useQuery<CashStatus>({
        queryKey: ["lottery", "cash-status", branchId],
        queryFn: async ({ signal }) => (await axios.get("/lottery/cash-status", { params: { branch_id: branchId }, signal })).data,
        staleTime: Infinity, refetchInterval: false,
        refetchOnMount: "always", refetchOnWindowFocus: "always", refetchOnReconnect: "always",
    });
    const mode = query.data?.reconciliation_mode ?? initialMode;
    // Confirm the current policy before opening a socket, including when cached data exists.
    const realtimeEnabled = query.isSuccess && query.isFetchedAfterMount && mode === "cash";
    useEffect(() => {
        if (!realtimeEnabled) { setConnection("disabled"); return; }
        let active = true;
        const key = ["lottery", "cash-status", branchId];
        const resync = () => { if (active) void client.invalidateQueries({ queryKey: key, exact: true }); };
        const unsubscribe = subscribeCashStatus(officeId, branchId, event => {
            if (!active || event.branch_id !== branchId || event.office_id !== officeId) return;
            const previous = client.getQueryData<CashStatus>(key);
            if (event.state === "closed" && (!previous?.current || previous.current.id === event.session_id)) {
                void client.cancelQueries({ queryKey: key, exact: true });
                client.setQueryData<CashStatus>(key, { ...previous, current: null });
                setNotice("La caja de esta banca fue cerrada. Abre una nueva caja para continuar. Tus jugadas se conservan.");
            }
            resync();
        }, resync, state => { if (active) setConnection(state); });
        return () => { active = false; unsubscribe(); };
    }, [branchId, officeId, userId, client, realtimeEnabled]);
    useEffect(() => { if (query.data?.current || mode === "report") setNotice(""); }, [query.data?.current, mode]);
    return { query, connection, notice };
}
