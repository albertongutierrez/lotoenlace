import { useRef, useState, type HTMLAttributes } from "react";

/** Mouse dragging scrolls the viewport; touch keeps native scrolling. */
export default function DragScrollArea({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
    const drag = useRef<{ id: number; x: number; y: number; top: number; left: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    const [dragging, setDragging] = useState(false);
    return <div {...props} className={`${className} ${dragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
        onPointerDown={event => {
            suppressClick.current = false;
            if (event.pointerType !== "mouse" || event.button !== 0 || !(event.target instanceof Element)) return;
            if (event.target.closest('button, a, input, select, textarea, [role="button"], [contenteditable="true"]')) return;
            const el = event.currentTarget;
            // Leave the native scrollbar thumb available for ordinary dragging.
            const bounds = el.getBoundingClientRect();
            if (event.clientX - bounds.left >= el.clientWidth || event.clientY - bounds.top >= el.clientHeight) return;
            if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return;
            event.preventDefault();
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, top: el.scrollTop, left: el.scrollLeft, moved: false };
            el.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (!start.moved && Math.hypot(dx, dy) < 4) return;
            start.moved = true;
            suppressClick.current = true;
            setDragging(true);
            event.currentTarget.scrollTop = start.top - dy;
            event.currentTarget.scrollLeft = start.left - dx;
        }}
        onPointerUp={event => {
            if (drag.current?.id !== event.pointerId) return;
            drag.current = null;
            setDragging(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { drag.current = null; setDragging(false); suppressClick.current = false; }}
        onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
        onClickCapture={event => {
            if (!suppressClick.current) return;
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
        }}
        onDragStart={event => event.preventDefault()}
    >{children}</div>;
}
