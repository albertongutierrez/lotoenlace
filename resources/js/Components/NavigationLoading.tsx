import { useEffect, useState } from "react";
import { router } from "@inertiajs/react";
import LoadingSkeleton from "./LoadingSkeleton";

// Keep the current page mounted so a cancelled visit preserves pending forms/tickets.
export default function NavigationLoading() {
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const start = router.on("start", ({ detail }) => {
            clearTimeout(timer);
            if (detail.visit.method.toLowerCase() === "get") timer = setTimeout(() => setLoading(true), 150);
        });
        const finish = router.on("finish", () => { clearTimeout(timer); setLoading(false); });
        return () => { start(); finish(); clearTimeout(timer); };
    }, []);
    if (!loading) return null;
    return <div className="absolute inset-0 z-40 overflow-hidden bg-white p-4 dark:bg-slate-950"><LoadingSkeleton label="Cargando pantalla…" /></div>;
}
