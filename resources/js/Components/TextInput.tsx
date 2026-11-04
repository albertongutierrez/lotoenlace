import { forwardRef, useEffect, useImperativeHandle, useRef, InputHTMLAttributes } from 'react';

export default forwardRef(function TextInput(

    { type = 'text', className = '', isFocused = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { isFocused?: boolean },

    ref

) {

    const localRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({

        focus: () => localRef.current?.focus(),

    }));

    useEffect(() => {

        if (isFocused) {

            localRef.current?.focus();

        }

    }, []);

    return (

        <input

            {...props}

            type={type}

            autoComplete="off"

            className={

                'rounded-md border-slate-300 bg-white text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 ' +

                className

            }

            ref={localRef}

        />

    );

});
