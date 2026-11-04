export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export const formatDominicanDocument = (value: string) => {

    const digits = onlyDigits(value).slice(0, 11);

    if (digits.length <= 9) {

        if (digits.length <= 1) return digits;

        if (digits.length <= 3) return `${digits.slice(0, 1)}-${digits.slice(1)}`;

        if (digits.length <= 8) return `${digits.slice(0, 1)}-${digits.slice(1, 3)}-${digits.slice(3)}`;

        return `${digits.slice(0, 1)}-${digits.slice(1, 3)}-${digits.slice(3, 8)}-${digits.slice(8)}`;

    }

    if (digits.length <= 3) return digits;

    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;

};

export const formatDominicanPhone = (value: string) => {

    const digits = onlyDigits(value).slice(0, 10);

    if (digits.length <= 3) return digits;

    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;

};
