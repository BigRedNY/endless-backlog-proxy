import fetch from 'node-fetch';

export default async function (request, response) {
    response.setHeader('Access-Control-Allow-Origin', 'https://bigredny.github.io'); // Explicitly allow your GitHub Pages domain
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

    // --- REFINED PROMPT TO GET STRUCTURED JSON DATA ---
    // This prompt instructs Gemini to output a JSON string with specific keys.
    // It also tries to clarify the 'Average' aspect.
    const prompt = `Search HowLongToBeat.com for "${gameTitle}". Provide the average completion times for 'Main Story', 'Main + Extras', 'Completionist', and 'All Styles' from the primary game entry. If a time is not available or the game is not found, use 'N/A'. Format your response as a JSON string: {"Main Story": "[time]", "Main + Extras": "[time]", "Completionist": "[time]", "All Styles": "[time]"}. Example: {"Main Story": "30h", "Main + Extras": "45h 30m", "Completionist": "60h", "All Styles": "48h"}.`;
    console.log(`[Proxy] Prompt for Gemini: "${prompt}"`);

    try {
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
        const geminiPayload = { 
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            // IMPORTANT: Request JSON response type from Gemini for best results
            generationConfig: {
                responseMimeType: "application/json",
            }
        };

        console.log(`[Proxy] Calling Gemini API: ${geminiApiUrl}`);
        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        console.log(`[Proxy] Gemini API Response Status: ${geminiResponse.status}`);
        const geminiRawResult = await geminiResponse.json();
        console.log('[Proxy] Raw Gemini API Result:', JSON.stringify(geminiRawResult, null, 2));

        let extractedTime = "N/A (Parse Error)"; // Default if parsing fails
        let parsedGeminiData = null;

        if (geminiRawResult.candidates && geminiRawResult.candidates.length > 0 &&
            geminiRawResult.candidates[0].content && geminiRawResult.candidates[0].content.parts &&
            geminiRawResult.candidates[0].content.parts.length > 0) {
            
            const geminiTextResponse = geminiRawResult.candidates[0].content.parts[0].text.trim();
            console.log(`[Proxy] Gemini Text Response (before JSON parse): "${geminiTextResponse}"`);

            try {
                // Attempt to parse the response as JSON
                parsedGeminiData = JSON.parse(geminiTextResponse);
                
                // Directly access the "Main + Extras" property
                if (parsedGeminiData && parsedGeminiData["Main + Extras"]) {
                    extractedTime = parsedGeminiData["Main + Extras"].trim();
                    console.log(`[Proxy] Successfully extracted "Main + Extras" from JSON: "${extractedTime}"`);

                    // Optional: Re-format if LLM gives "103h 44m" and we want "103h" if minutes are above 30, otherwise just "103h"
                    // Or keep it as "103h 44m" if that's preferred.
                    // Your frontend `parseTimeToHours` can handle "Xh Ym" and "Xh"
                } else {
                    console.warn('[Proxy] Parsed JSON did not contain "Main + Extras" key or it was empty:', parsedGeminiData);
                    extractedTime = "N/A (Key not found)";
                }
            } catch (jsonParseError) {
                console.error('[Proxy] Failed to parse Gemini response as JSON:', jsonParseError);
                extractedTime = "N/A (Invalid JSON)";
            }
        } else {
            console.warn('[Proxy] Gemini API result did not contain expected data structure or content.');
            extractedTime = "N/A (API issue)";
        }

        console.log(`[Proxy] Final extracted time for frontend: "${extractedTime}"`);
        return response.status(200).json({ time: extractedTime });

    } catch (error) {
        console.error('[Proxy] Error during Gemini API fetch or overall processing:', error);
        return response.status(500).send("Error fetching time from API.");
    }
}
