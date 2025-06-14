import fetch from 'node-fetch'; // Vercel's Node.js runtime supports fetch

export default async function (request, response) {
    const { gameTitle } = request.query; // Get gameTitle from query parameters

    if (!gameTitle) {
        return response.status(400).send('Missing gameTitle parameter.');
    }

    // Get API key from environment variable (SECURE!)
    const geminiApiKey = process.env.GEMINI_API_KEY; 

    if (!geminiApiKey) {
        return response.status(500).send('Serverless function is missing API key configuration.');
    }

    const prompt = `Search HowLongToBeat.com for "${gameTitle}" and extract the "Main + Extras" completion time. Respond ONLY with the time (e.g., "30h 15m", "N/A (No data yet)", "70-75h (approx.)"). If multiple results, take the most relevant one.`;

    try {
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
        const geminiPayload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });
        const geminiResult = await geminiResponse.json();

        if (geminiResult.candidates && geminiResult.candidates.length > 0 &&
            geminiResult.candidates[0].content && geminiResult.candidates[0].content.parts &&
            geminiResult.candidates[0].content.parts.length > 0) {
            const time = geminiResult.candidates[0].content.parts[0].text.trim();
            return response.status(200).json({ time: time });
        } else {
            return response.status(200).json({ time: "N/A (No data yet)" });
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return response.status(500).send("Error fetching time from API.");
    }
}
