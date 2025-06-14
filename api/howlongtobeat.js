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

    // --- REFINED PROMPT TO EXPLICITLY ASK FOR "AVERAGE" TIMES ---
    const prompt = `Search HowLongToBeat.com for "${gameTitle}". From the primary game entry, find the "Average" time for 'Main Story', 'Main + Extras', 'Completionist', and 'All Styles'. If a specific time is not available or the game is not found, use 'N/A'. Format your response as: "Main: [time], Extras: [time], 100%: [time], All: [time]". Example: "Main: 30h, Extras: 45h 30m, 100%: 60h, All: 48h".`;
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

        let extractedTime = "N/A (Parse Error)"; // Default if parsing fails

        if (geminiResult.candidates && geminiResult.candidates.length > 0 &&
            geminiResult.candidates[0].content && geminiResult.candidates[0].content.parts &&
            geminiResult.candidates[0].content.parts.length > 0) {
            const geminiTextResponse = geminiResult.candidates[0].content.parts[0].text.trim();
            console.log(`[Proxy] Gemini Text Response: "${geminiTextResponse}"`);

            // --- REGULAR EXPRESSION PARSING FOR "Main + Extras" ---
            // Adjusted regex to robustly capture the Extras time, assuming the new prompt format
            const regex = /Extras:\s*([^,]+?)(?:,\s*|$)/; // Captures anything after "Extras: " until the next comma or end of string
            const match = geminiTextResponse.match(regex);

            if (match && match[1]) {
                extractedTime = match[1].trim();
                // Handle "70-75h (approx.)" or similar ranges from the LLM
                if (extractedTime.includes('-') && extractedTime.toLowerCase().includes('h')) {
                    const rangeParts = extractedTime.toLowerCase().replace('h', '').split('-').map(s => parseFloat(s.trim()));
                    if (rangeParts.length === 2 && !isNaN(rangeParts[0]) && !isNaN(rangeParts[1])) {
                        extractedTime = `${Math.round((rangeParts[0] + rangeParts[1]) / 2)}h (approx.)`; // Average the range and round
                    }
                } else if (extractedTime.toLowerCase().includes('h') && !extractedTime.toLowerCase().includes('m')) {
                    extractedTime = `${parseFloat(extractedTime.toLowerCase().replace('h', '').trim())}h`; // Ensure consistent 'Xh' format
                }
                // If it's just a number, assume hours
                else if (!isNaN(parseFloat(extractedTime)) && !extractedTime.toLowerCase().includes('h')) {
                    extractedTime = `${parseFloat(extractedTime)}h`;
                }
            } else {
                console.warn('[Proxy] "Main + Extras" not found in Gemini\'s structured response or regex failed.');
                extractedTime = "N/A (Not found)";
            }
        } else {
            console.warn('[Proxy] Gemini API result did not contain expected data structure or content.');
            extractedTime = "N/A (API issue)";
        }

        console.log(`[Proxy] Final extracted time for frontend: "${extractedTime}"`);
        return response.status(200).json({ time: extractedTime });

    } catch (error) {
        console.error('[Proxy] Error during Gemini API fetch or processing:', error);
        return response.status(500).send("Error fetching time from API.");
    }
}
