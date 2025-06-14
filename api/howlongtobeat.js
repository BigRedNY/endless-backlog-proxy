import fetch from 'node-fetch';

export default async function (request, response) {
    // Set CORS headers for all responses
    // For development, use '*' to allow all origins.
    // For production, replace '*' with your specific GitHub Pages domain, e.g., 'https://yourusername.github.io'
    response.setHeader('Access-Control-Allow-Origin', '*'); // IMPORTANT: Change '*' to your GitHub Pages domain in production!
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request for CORS
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

    const prompt = `Search HowLongToBeat.com for "${gameTitle}" and extract the "Main + Extras" completion time. Respond ONLY with the time (e.g., "30h 15m", "N/A (No data yet)", "70-75h (approx.)"). If multiple results, take the most relevant one.`;
    console.log(`[Proxy] Prompt for Gemini: "${prompt}"`);

    try {
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
        const geminiPayload = { contents: [{ role: "user", parts: [{ text: prompt }] }];

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
            console.log(`[Proxy] Successfully extracted time: "${time}"`);
            return response.status(200).json({ time: time });
        } else {
            console.warn('[Proxy] Gemini API result did not contain expected data structure.');
            return response.status(200).json({ time: "N/A (No data yet)" });
        }
    } catch (error) {
        console.error('[Proxy] Error during Gemini API fetch:', error);
        return response.status(500).send("Error fetching time from API.");
    }
}
