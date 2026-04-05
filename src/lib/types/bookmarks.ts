export interface Bookmark {
    id: number;
    surah: number;
    ayah: number;
    note: string | null;
    created_at: string;
}

export interface LastRead {
    surah: number;
    ayah: number;
    updated_at: string;
}

export interface Highlight {
    id: number;
    surah: number;
    ayah: number;
    text: string;
    note: string | null;
    created_at: string;
}
