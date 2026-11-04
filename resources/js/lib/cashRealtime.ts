import Echo from "laravel-echo";
import Pusher from "pusher-js";
import axios from "axios";

export type CashChange = { office_id: number; branch_id: number; session_id: number | null; state: "open" | "closed" | "configuration_changed" };
export type CashConnection = "disabled" | "connecting" | "connected" | "disconnected";

export function subscribeCashStatus(officeId: number, branchId: number, changed: (event: CashChange) => void, resync: () => void, connectionChanged: (state: CashConnection) => void): () => void {
    const key = import.meta.env.VITE_REVERB_APP_KEY;
    if (!key || !officeId) { connectionChanged("disconnected"); return () => {}; }
    let disposed = false;
    connectionChanged("connecting");
    const echo = new Echo({
        broadcaster: "reverb", Pusher, key,
        wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
        wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
        wssPort: Number(import.meta.env.VITE_REVERB_PORT || 443),
        forceTLS: import.meta.env.VITE_REVERB_SCHEME === "https",
        enabledTransports: ["ws", "wss"], disableStats: true,
        authorizer: (channel: { name: string }) => ({
            authorize: (socketId: string, callback: (error: Error | null, data: any) => void) => {
                axios.post("/broadcasting/auth", { socket_id: socketId, channel_name: channel.name })
                    .then(response => { if (!disposed) callback(null, response.data); })
                    .catch(error => { if (!disposed) { connectionChanged("disconnected"); callback(error, null); } });
            },
        }),
    });
    const connection = echo.connector.pusher.connection;
    const stateChanged = ({ current }: { current: string }) => {
        if (disposed || current === "connected") return;
        connectionChanged(current === "connecting" ? "connecting" : "disconnected");
    };
    connection.bind("state_change", stateChanged);
    const channel = `lottery.cash.${officeId}.${branchId}`;
    echo.private(channel).listen(".cash.status.changed", (event: CashChange) => {
        if (!disposed && event.office_id === officeId && event.branch_id === branchId && ["open", "closed", "configuration_changed"].includes(event.state)) changed(event);
    }).subscribed(() => {
        if (disposed) return;
        connectionChanged("connected");
        resync(); // Fetch once after subscribing/reconnecting to recover missed events.
    }).error(() => { if (!disposed) connectionChanged("disconnected"); });
    return () => { disposed = true; connection.unbind("state_change", stateChanged); echo.leave(channel); echo.disconnect(); };
}
