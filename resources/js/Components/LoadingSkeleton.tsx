import { Skeleton } from "boneyard-js/react";
import { useEffect, useState } from "react";

export default function LoadingSkeleton({ compact = false, label = "Cargando datos…" }: { compact?: boolean; label?: string }) {
    const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const change = () => setReduced(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    const height = compact ? 100 : 310;
    // Boneyard uses percentages for x/w and pixels for y/h.
    const bones = { breakpoints: { 0: { name: "loto-loading", viewportWidth: 600, width: 600, height,
        bones: [
            { x: 0, y: 0, w: 34, h: 22, r: 5 },
            ...Array.from({ length: compact ? 2 : 6 }, (_, row) => [0, 1, 2].map(col => ({ x: col * 33, y: 40 + row * 40, w: col === 0 ? 28 : 22, h: 17, r: 4 }))).flat(),
        ],
    } } };
    return <div role="status" aria-busy="true" className="w-full overflow-hidden p-3"><span className="sr-only">{label}</span><div aria-hidden="true"><Skeleton loading initialBones={bones} animate={reduced ? "solid" : "shimmer"} color="#e2e8f0" darkColor="#334155">{null}</Skeleton></div></div>;
}
