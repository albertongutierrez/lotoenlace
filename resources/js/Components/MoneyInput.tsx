import { forwardRef, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
    value: string;
    onValueChange: (value: string) => void;
};

const formatted = (value: string) => {
    const [whole, decimal] = value.split(".");
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimal === undefined ? "" : `.${decimal}`);
};

const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput({ value, onValueChange, ...props }, ref) {
    return <input {...props} ref={ref} type="text" inputMode="decimal" value={formatted(value)} onChange={event => {
        const field = event.currentTarget;
        const raw = field.value.replace(/,/g, "");
        if (!/^\d{0,9}(\.\d{0,2})?$/.test(raw)) return;
        const beforeCaret = field.value.slice(0, field.selectionStart ?? field.value.length).replace(/,/g, "").length;
        onValueChange(raw);
        requestAnimationFrame(() => {
            if (!field.isConnected || document.activeElement !== field) return;
            let offset = 0;
            let count = 0;
            while (offset < field.value.length && count < beforeCaret) {
                if (field.value[offset] !== ",") count++;
                offset++;
            }
            field.setSelectionRange(offset, offset);
        });
    }} />;
});
export default MoneyInput;
