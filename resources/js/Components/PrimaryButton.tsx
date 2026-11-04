import { ButtonHTMLAttributes } from 'react';

export default function PrimaryButton({ className = '', disabled, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {

    return (

        <button

            {...props}

            className={

                `inline-flex items-center rounded-md border border-transparent bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-normal text-white transition duration-150 ease-in-out hover:bg-slate-800 focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 active:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-900 ${

                    disabled && 'opacity-25'

                } ` + className

            }

            disabled={disabled}

        >

            {children}

        </button>

    );

}
