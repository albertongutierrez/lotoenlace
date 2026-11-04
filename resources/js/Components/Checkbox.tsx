import { InputHTMLAttributes } from 'react';

export default function Checkbox({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {

    return (

        <input

            {...props}

            type="checkbox"

            className={

                'rounded border-slate-300 bg-white text-slate-950 shadow-sm focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-500 dark:checked:border-slate-500 dark:checked:bg-slate-700 dark:focus:ring-slate-600 ' +

                className

            }

        />

    );

}
