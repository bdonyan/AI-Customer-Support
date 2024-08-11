import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const data = await req.json();
        const userQuery = data[data.length - 1].content;

        if (!userQuery || typeof userQuery !== 'string') {
            throw new Error("Invalid user query.");
        }

        // Call the retrieve route to get relevant contexts
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

        const systemPrompt = `You are a knowledgeable career advisor for students at the California Institute of Technology. 
        Your goal is to assist students with their career-related questions, including resume building, interview preparation, 
        job search strategies, networking, and using resources like the Career Development Center. 
        Your advice should be based on the information provided in the 2020 Career Guide, 
        ensuring that your answers are thorough, accurate, and tailored to the specific needs of Caltech students. 
        Provide clear and concise guidance that reflects the high standards and expectations of Caltech's academic and professional environment.`;

        // Generate a response from OpenAI
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
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
                const reader = openaiResponse.body.getReader();
                let done = false;

                while (!done) {
                    const { value, done: readerDone } = await reader.read();
                    done = readerDone;

                    const chunk = new TextDecoder().decode(value);
                    const lines = chunk.split("\n").filter(Boolean);

                    for (const line of lines) {
                        const trimmedLine = line.trim();

                        if (trimmedLine === "[DONE]") {
                            done = true;
                            break;
                        }

                        if (trimmedLine.startsWith("data: ")) {
                            const content = trimmedLine.slice(6).trim();
                            if (content) {
                                try {
                                    // Ensure the string is valid JSON
                                    if (content.startsWith("{") && content.endsWith("}")) {
                                        const json = JSON.parse(content);

                                        // Handle different response structures (e.g., finish_reason vs finish_details)
                                        if (json.choices[0]?.finish_reason || json.choices[0]?.finish_details) {
                                            controller.close();
                                            return;
                                        }

                                        const text = json.choices[0]?.delta?.content || "";
                                        const encodedText = encoder.encode(text);
                                        controller.enqueue(encodedText);
                                    }
                                } catch (err) {
                                    console.error("Error parsing stream content:", err);
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
