import { PineconeStore } from "@langchain/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from 'path';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        // Initialize OpenAI Embeddings
        const embeddings = new OpenAIEmbeddings({
            model: "text-embedding-3-small",
        });

        // Initialize Pinecone client
        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });   

        // Use existing Pinecone index
        const pineconeIndex = pc.Index("chatbot");

        // Load the PDF
        const pdfPath = path.resolve('./public/documents/radforded.pdf');
        const loader = new PDFLoader(pdfPath);
        const documents = await loader.load();

        // Split the document into chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            overlap: 200,
        });

        const splitDocs = await splitter.splitDocuments(documents);

        // console.log(splitDocs)

        // Upsert embeddings into Pinecone using PineconeStore
        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex,
            maxConcurrency: 5, // Adjust based on your needs
        });

        await vectorStore.addDocuments(splitDocs);

        return NextResponse.json({ message: "Embeddings created and stored in Pinecone." });

    } catch (error) {
        console.error("Error creating embeddings:", error);
        return NextResponse.json({ error: "Failed to create embeddings." }, { status: 500 });
    }
}