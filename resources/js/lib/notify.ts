type NotifyType = 'error' | 'success' | 'info';

const styles: Record<NotifyType, { bar: string; icon: string; title: string }> = {

    error: { bar: 'bg-red-500', icon: '!', title: 'Atencion' },

    success: { bar: 'bg-emerald-500', icon: 'OK', title: 'Listo' },

    info: { bar: 'bg-slate-500', icon: 'i', title: 'Aviso' },

};

const overlayZIndex = '2147483647';

export const notify = (message: string, type: NotifyType = 'error', title?: string) => {

    if (typeof document === 'undefined') return;

    const previous = document.getElementById('app-notify-toast');

    previous?.remove();

    const palette = styles[type];

    const wrapper = document.createElement('div');

    wrapper.id = 'app-notify-toast';

    wrapper.className = 'fixed inset-x-0 top-5 flex justify-center px-4';

    wrapper.style.zIndex = overlayZIndex;

    wrapper.innerHTML = `

        <div class="w-full max-w-md overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900">

            <div class="flex">

                <div class="${palette.bar} w-1.5"></div>

                <div class="flex min-w-0 flex-1 gap-3 p-4">

                    <div class="${palette.bar} flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">${palette.icon}</div>

                    <div class="min-w-0 flex-1">

                        <div class="text-sm font-semibold text-slate-950 dark:text-white">${escapeHtml(title || palette.title)}</div>

                        <div class="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">${escapeHtml(message)}</div>

                    </div>

                    <button type="button" class="h-8 w-8 shrink-0 rounded-md text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100" aria-label="Cerrar">x</button>

                </div>

            </div>

        </div>

    `;

    wrapper.querySelector('button')?.addEventListener('click', () => wrapper.remove());

    document.body.appendChild(wrapper);

    window.setTimeout(() => wrapper.remove(), 6500);

};

export const confirmAction = (

    message: string,

    onConfirm: () => void,

    options: { title?: string; confirmText?: string; cancelText?: string; tone?: 'danger' | 'default' } = {},

) => {

    if (typeof document === 'undefined') return;

    const previous = document.getElementById('app-confirm-dialog');

    previous?.remove();

    const tone = options.tone ?? 'danger';

    const confirmClass = tone === 'danger'

        ? 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500'

        : 'bg-slate-950 text-white hover:bg-slate-800 focus:ring-slate-500 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white';

    const wrapper = document.createElement('div');

    wrapper.id = 'app-confirm-dialog';

    wrapper.className = 'fixed inset-0 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm';

    wrapper.style.zIndex = overlayZIndex;

    wrapper.innerHTML = `

        <div class="w-full max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">

            <div class="flex items-start gap-3">

                <div class="${tone === 'danger' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'} flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold">!</div>

                <div class="min-w-0 flex-1">

                    <h3 class="text-base font-semibold text-slate-950 dark:text-white">${escapeHtml(options.title || 'Confirmar accion')}</h3>

                    <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">${escapeHtml(message)}</p>

                </div>

            </div>

            <div class="mt-5 flex justify-end gap-2">

                <button type="button" data-cancel class="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">${escapeHtml(options.cancelText || 'Cancelar')}</button>

                <button type="button" data-confirm class="min-h-10 rounded-md px-4 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${confirmClass}">${escapeHtml(options.confirmText || 'Eliminar')}</button>

            </div>

        </div>

    `;

    const close = () => wrapper.remove();

    wrapper.querySelector('[data-cancel]')?.addEventListener('click', close);

    wrapper.addEventListener('click', (event) => {

        if (event.target === wrapper) close();

    });

    wrapper.querySelector('[data-confirm]')?.addEventListener('click', () => {

        close();

        onConfirm();

    });

    document.body.appendChild(wrapper);

    (wrapper.querySelector('[data-cancel]') as HTMLButtonElement | null)?.focus();

};

export const showAlert = (

    message: string,

    options: { title?: string; confirmText?: string; tone?: 'danger' | 'default' } = {},

) => {

    if (typeof document === 'undefined') return;

    const previous = document.getElementById('app-alert-dialog');

    previous?.remove();

    const tone = options.tone ?? 'danger';

    const buttonClass = tone === 'danger'

        ? 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500'

        : 'bg-slate-950 text-white hover:bg-slate-800 focus:ring-slate-500 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white';

    const wrapper = document.createElement('div');

    wrapper.id = 'app-alert-dialog';

    wrapper.className = 'fixed inset-0 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm';

    wrapper.style.zIndex = overlayZIndex;

    wrapper.innerHTML = `

        <div class="w-full max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">

            <div class="flex items-start gap-3">

                <div class="${tone === 'danger' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'} flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold">!</div>

                <div class="min-w-0 flex-1">

                    <h3 class="text-base font-semibold text-slate-950 dark:text-white">${escapeHtml(options.title || 'Aviso')}</h3>

                    <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">${escapeHtml(message)}</p>

                </div>

            </div>

            <div class="mt-5 flex justify-end">

                <button type="button" data-confirm class="min-h-10 rounded-md px-4 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${buttonClass}">${escapeHtml(options.confirmText || 'Entendido')}</button>

            </div>

        </div>

    `;

    const close = () => wrapper.remove();

    wrapper.addEventListener('click', (event) => {

        if (event.target === wrapper) close();

    });

    wrapper.querySelector('[data-confirm]')?.addEventListener('click', close);

    document.body.appendChild(wrapper);

    (wrapper.querySelector('[data-confirm]') as HTMLButtonElement | null)?.focus();

};

const escapeHtml = (value: string) => value

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;')

    .replace(/'/g, '&#039;');
