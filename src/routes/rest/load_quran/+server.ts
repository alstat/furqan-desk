import { API_LOCAL } from "$lib/functions/utils/utils";
import { selectedSurahIdx } from "$lib/stores/quran.svelte";

export async function GET({ request }: { request: Request}) {
    try {
        console.log('GET request received from api/quran_api')

        const resp = await fetch(`${API_LOCAL}`)
        if (!resp.ok) {
            throw new Error(`HTTP error! status: ${resp.status}`)
        }

        const outp = await resp.json();
        console.log('Response from Julia:', outp)
        return new Response(
            JSON.stringify({
                payload: outp                
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        )
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

export async function POST({ request }: { request: Request }) {
    try {
        console.log('Request received from api/quran_api');
        
        // Parse the incoming form data
        const formData = await request.formData();
        // const surahIdx = formData.get('surah-idx');
        const surahIdx = parseInt(formData.get('surah-idx') as string);
        selectedSurahIdx.set(surahIdx)
        
        console.log('Selected surah:', surahIdx);
        console.log('Sending request to Julia');

        // Send request to your Julia backend with the selected surah
        const resp = await fetch(`${API_LOCAL}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                surah_idx: surahIdx
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