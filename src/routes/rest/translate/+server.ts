import { API_LOCAL } from "$lib/functions/utils/utils";
import { selectedSurahIdx } from "$lib/stores/quran.svelte";
import { get } from "svelte/store";

export async function POST({ request }: { request: Request }) {
    try {
        console.log('Request received for change in translation');
        
        // Parse the incoming form data
        const formData = await request.formData();
        const surahTranslation = formData.get('surah-translation');
        
        console.log('Selected surah:', surahTranslation);
        console.log('Sending request to Julia');

        // Send request to your Julia backend with the selected surah
        const resp = await fetch(`${API_LOCAL}/translate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                surah_idx: get(selectedSurahIdx),
                translation: surahTranslation
            })
        });

        if (!resp.ok) {
            throw new Error(`HTTP error! status: ${resp.status}`);
        }

        const outp = await resp.json();
        console.log('Response from Julia:', outp);

        return new Response(
            JSON.stringify({
                payload: outp,
                success: true
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch(error) {
        console.error('Error processing request:', error);
        
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                success: false
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
    }
}