import fetch from 'node-fetch';

export default async function (request, response) {
    response.setHeader('Access-Control-Allow-Origin', 'https://bigredny.github.io'); 
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).send();
    }

    const { gameTitle } = request.query || request.queryStringParameters; 

    console.log(`[Proxy] Received request for gameTitle: "${gameTitle}"`);

    if (!gameTitle) {
        console.warn('[Proxy] Missing gameTitle parameter in request.');
        return response.status(400).send('Missing gameTitle parameter.');
    }

    const geminiApiKey = process.env.GEMINI_API_KEY; 
    
    if (!geminiApiKey) {
        console.error('[Proxy] GEMINI_API_KEY environment variable is NOT set!');
        return response.status(500).send('Server configuration error: API key missing.');
    }

    // --- REFINED PROMPT ---
    const prompt = `Search HowLongToBeat.com for "${gameTitle}". From the primary game entry's average times, find the 'Main + Extras' completion time. Prioritize the base game over DLC/collections unless the query specifically indicates a collection/DLC. Respond ONLY with the time (e.g., "30h 15m", "N/A (No data yet)", "70-75h (approx.)"). If 'Main + Extras' is not explicitly listed or clearly identifiable, return "N/A (Not found)".`;
    console.log(`[Proxy] Prompt for Gemini: "${prompt}"`);

    try {
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
        const geminiPayload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

        console.log(`[Proxy] Calling Gemini API: ${geminiApiUrl}`);
        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        console.log(`[Proxy] Gemini API Response Status: ${geminiResponse.status}`);
        const geminiResult = await geminiResponse.json();
        console.log('[Proxy] Raw Gemini API Result:', JSON.stringify(geminiResult, null, 2));

        if (geminiResult.candidates && geminiResult.candidates.length > 0 &&
            geminiResult.candidates[0].content && geminiResult.candidates[0].content.parts &&
            geminiResult.candidates[0].content.parts.length > 0) {
            const time = geminiResult.candidates[0].content.parts[0].text.trim();
            
            // Further client-side validation to ensure it looks like a time
            if (time.toLowerCase().includes('n/a') || !/\d/.test(time)) {
                 console.warn(`[Proxy] Extracted time "${time}" is not a valid time format.`);
                 return response.status(200).json({ time: "N/A (Not found)" });
            }

            console.log(`[Proxy] Successfully extracted time: "${time}"`);
            return response.status(200).json({ time: time });
        } else {
            console.warn('[Proxy] Gemini API result did not contain expected data structure or content.');
            return response.status(200).json({ time: "N/A (API issue)" }); // Changed from "No data yet" to be more specific
        }
    } catch (error) {
        console.error('[Proxy] Error during Gemini API fetch:', error);
        return response.status(500).send("Error fetching time from API.");
    }
}
