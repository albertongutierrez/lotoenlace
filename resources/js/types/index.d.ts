export interface User {

    id: number;

    name: string;

    email: string;

    email_verified_at: string;

    permissions?: string[];

    is_super_admin?: boolean;

    is_admin?: boolean;

}

export interface BranchOfficeSummary {
    reconciliation_mode?: 'cash' | 'report';

    id?: number;

    id_hash: string;

    name: string;

    code: string;

    office_id_hash?: string | null;

    office_name?: string | null;

    office_slogan?: string | null;

    office_logo_url?: string | null;

    office_compact_logo_url?: string | null;

}

export type PageProps<T extends Record<string, unknown> = Record<string, unknown>> = T & {

    appName: string;

    auth: { user: User; activeBranchOffice: BranchOfficeSummary | null; availableBranchOffices: BranchOfficeSummary[] };

    flash?: { success?: string | null };

};
