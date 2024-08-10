import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const { query } = await req.json(); // Extract the user's query

        const openai = new OpenAIEmbeddings({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
        });

        // Embed the query
        const queryEmbedding = await openai.embedQuery(query);

        // Query Pinecone for the most relevant documents
        const pineconeIndex = pc.Index("chatbot");

        // console.log(queryEmbedding)

        const topMatches = await pineconeIndex.query({
            vector: queryEmbedding,  // Pass the embedding vector
            topK: 10,                // Get top 10 matches
            includeMetadata: true    // Include metadata in the response
        });

        const contexts = topMatches.matches.map(match => match.metadata.text);

        return NextResponse.json({ contexts });
    } catch (error) {
        console.error("Error during retrieval:", error);
        return NextResponse.json({ error: "Failed to retrieve context." }, { status: 500 });
    }
}
