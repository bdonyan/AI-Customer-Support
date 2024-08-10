import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const data = await req.json();
        const userQuery = data[1].content;

        if (!userQuery || typeof userQuery !== 'string') {
            throw new Error("Invalid user query.");
        }

        const retrieveResponse = await fetch('http://localhost:3000/api/retrieve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: userQuery }),
        });

        const retrieveData = await retrieveResponse.json();
        const contexts = retrieveData.contexts || [];

        const augmentedQuery = `<CONTEXT>\n${contexts.join("\n\n-------\n\n")}\n-------\n</CONTEXT>\n\nMY QUESTION:\n${userQuery}`;

        const systemPrompt = `You are an expert personal assistant. Answer any questions I have based only on the context provided.`;

        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: augmentedQuery }
                ],
                stream: true,
            }),
        });

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();

                // Get a reader to read the response stream
                const reader = openaiResponse.body.getReader();
                let done = false;

                while (!done) {
                    const { value, done: readerDone } = await reader.read();
                    done = readerDone;

                    // Decode the chunk to a string
                    const chunk = new TextDecoder().decode(value);
                    
                    // Parse each line
                    const lines = chunk.split("\n").filter(Boolean);
                    for (const line of lines) {
                        const trimmedLine = line.trim();

                        // If the line is `[DONE]`, break the loop
                        if (trimmedLine === "[DONE]") {
                            done = true;
                            break;
                        }

                        // Remove the 'data: ' prefix
                        if (trimmedLine.startsWith("data: ")) {
                            const content = trimmedLine.slice(6).trim();
                            if (content) {
                                try {
                                    // Parse JSON and enqueue the content
                                    const json = JSON.parse(content);
                                    const text = json.choices[0]?.delta?.content || "";
                                    const encodedText = encoder.encode(text);
                                    controller.enqueue(encodedText);
                                } catch (err) {
                                    console.error("Error parsing stream:", err);
                                }
                            }
                        }
                    }
                }

                controller.close();
            }
        });

        return new NextResponse(stream);
    } catch (err) {
        console.error("Error handling chat request:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
