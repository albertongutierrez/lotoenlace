import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 0, gcTime: 5 * 60 * 1000, retry: false },
        // Financial actions must never be retried or queued for reconnection automatically.
        mutations: { retry: false, networkMode: "always" },
    },
});

export function queryScope(page: { props: Record<string, any> }): string {
    const auth = page.props.auth;
    return JSON.stringify([auth?.user?.id ?? null, auth?.activeBranchOffice?.id_hash ?? null]);
}
