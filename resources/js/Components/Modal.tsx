import { Fragment, PropsWithChildren } from 'react';

import { Dialog, Transition } from '@headlessui/react';

export default function Modal({

    children,

    show = false,

    maxWidth = '2xl',

    closeable = true,

    onClose = () => {},
    afterLeave,

}: PropsWithChildren<{

    show: boolean;

    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '7xl';

    closeable?: boolean;

    onClose: CallableFunction;
    afterLeave?: () => void;

}>) {

    const close = () => {

        if (closeable) {

            onClose();

        }

    };

    const maxWidthClass = {

        sm: 'sm:max-w-sm',

        md: 'sm:max-w-md',

        lg: 'sm:max-w-lg',

        xl: 'sm:max-w-xl',

        '2xl': 'sm:max-w-2xl',
        '7xl': 'sm:max-w-[95vw] xl:max-w-7xl',

    }[maxWidth];

    return (

        <Transition show={show} as={Fragment} leave="duration-200" afterLeave={afterLeave}>

            <Dialog

                as="div"

                id="modal"

                className="fixed inset-0 flex overflow-y-auto px-4 py-6 sm:px-0 items-center z-50 transform transition-all"

                onClose={close}

            >

                <Transition.Child

                    as={Fragment}

                    enter="ease-out duration-300"

                    enterFrom="opacity-0"

                    enterTo="opacity-100"

                    leave="ease-in duration-200"

                    leaveFrom="opacity-100"

                    leaveTo="opacity-0"

                >

                    <div className="fixed inset-0 z-0 bg-slate-950/70" />

                </Transition.Child>

                <Transition.Child

                    as={Fragment}

                    enter="ease-out duration-300"

                    enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"

                    enterTo="opacity-100 translate-y-0 sm:scale-100"

                    leave="ease-in duration-200"

                    leaveFrom="opacity-100 translate-y-0 sm:scale-100"

                    leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"

                >

                    <Dialog.Panel
                        data-modal-panel

                        className={`relative z-10 w-full mb-6 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl transition-all dark:border-slate-700 dark:bg-slate-900 sm:mx-auto sm:w-full ${maxWidthClass}`}

                    >

                        {children}

                    </Dialog.Panel>

                </Transition.Child>

            </Dialog>

        </Transition>

    );

}
