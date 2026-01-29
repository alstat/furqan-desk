export async function fetchTranslation() {
    const resp = await fetch('/rest/translate')
    if (!resp.ok) {
        throw new Error('Failed to fetch surah list data')
    }
    const outp = await resp.json();
    return outp
}