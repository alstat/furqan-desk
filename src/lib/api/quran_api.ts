export async function fetchSurahList() {
    const resp = await fetch('/rest/load_quran')
    if (!resp.ok) {
        throw new Error('Failed to fetch surah list data')
    }
    const outp = await resp.json();
    return outp
}