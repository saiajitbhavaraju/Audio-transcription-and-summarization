// app/api/transcription-status/route.ts
import { NextResponse } from 'next/server';
import type { 
  AzureTranscriptionStatusResponse, 
  AzureTranscriptionFilesResponse, 
  TranscriptionResult, 
  RecognizedPhrase 
} from '@/lib/types'; // Ensure path to types is correct

import { 
    GoogleGenerativeAI, 
    HarmCategory, 
    HarmBlockThreshold,
    type SafetySetting // Import the SafetySetting type
} from "@google/generative-ai";

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
let geminiModel: any = null; // Using 'any' for simplicity, or a specific model type from SDK

if (GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Use a stable model name. "gemini-1.5-flash-latest" is fast and capable.
    // Or "gemini-1.0-pro" if you prefer.
    geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
  } catch (error) {
    console.error("Failed to initialize Gemini AI Client:", error);
  }
} else {
  console.warn("GEMINI_API_KEY not found. Summarization will be skipped.");
}

function extractTextFromTranscript(transcript: TranscriptionResult): string {
  if (!transcript || !transcript.recognizedPhrases) {
    return "";
  }
  return transcript.recognizedPhrases
    .map((phrase: RecognizedPhrase) => phrase.nBest[0].display)
    .join(" \n"); 
}

async function getSummaryFromGemini(text: string): Promise<string | null> {
  if (!geminiModel) {
    return "Summarizer: Gemini model not initialized (check API key/model name).";
  }
  if (!text.trim()) {
    return "Summarizer: No text provided to summarize.";
  }

  const generationConfig = {
    temperature: 0.7,
    topK: 1,
    topP: 1,
    maxOutputTokens: 1024, 
  };

  const safetySettings: SafetySetting[] = [ // Explicitly typed
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ];
  
  try {
    const prompt = `Provide a concise and neutral summary of the following transcribed audio content. Focus on the main topics, key decisions or outcomes if any, and distinct speakers or viewpoints if discernible.

    Transcribed Text:
    ---
    ${text}
    ---

    Concise Summary:`;
    
    console.log("Sending text to Gemini for summarization (length):", text.length);

    const result = await geminiModel.generateContent({
        contents: [{ role: "user", parts: [{text: prompt}]}],
        generationConfig,
        safetySettings,
    });
    const response = result.response;

    console.log("Full Gemini Response Object (for debugging if needed):", JSON.stringify(response, null, 2)); 

    if (response.promptFeedback?.blockReason) {
        console.error("Gemini prompt was blocked:", response.promptFeedback.blockReason, response.promptFeedback);
        return `Summary generation blocked: ${response.promptFeedback.blockReason}`;
    }
    
    // Robust way to get text, suitable for gemini-1.0-pro and gemini-1.5-flash/pro
    if (response.candidates && response.candidates.length > 0 &&
        response.candidates[0].content && response.candidates[0].content.parts &&
        response.candidates[0].content.parts.length > 0 && 
        typeof response.candidates[0].content.parts[0].text === 'string') {
        return response.candidates[0].content.parts[0].text;
    } else if (typeof response.text === 'function') { // Fallback for older SDKs or simpler responses
        const textResponse = response.text();
        if (textResponse) return textResponse;
    }
    
    console.error("No content or unexpected structure in Gemini response. Candidates:", response.candidates);
    return "Summary generation failed: Could not extract text from response.";

  } catch (error: any) {
    console.error("Error calling Gemini API:", error.message ? error.message : error);
    return `Error generating summary: ${error.message || "Unknown error"}`;
  }
}

export async function GET(request: Request) {
  console.log("--- /api/transcription-status endpoint hit ---");
  // console.log("AZURE_SPEECH_KEY loaded (first 5 chars):", SPEECH_KEY ? SPEECH_KEY.substring(0, 5) + "..." : "MISSING or UNDEFINED");
  // console.log("GEMINI_API_KEY loaded (first 5 chars):", GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 5) + "..." : "MISSING or UNDEFINED");

  if (!SPEECH_KEY) {
    console.error("CRITICAL: AZURE_SPEECH_KEY is not available.");
    return NextResponse.json({ message: "Server configuration error: Azure Speech Key missing." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const locationUrl = searchParams.get('locationUrl');

  if (!locationUrl || typeof locationUrl !== 'string') {
    return NextResponse.json({ message: "Missing or invalid 'locationUrl' query parameter." }, { status: 400 });
  }

  try {
    // console.log(`Fetching Azure status from: ${locationUrl}`);
    const statusResponse = await fetch(locationUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': SPEECH_KEY },
    });
    // console.log(`Azure status fetch response: ${statusResponse.status} ${statusResponse.statusText}`);

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      return NextResponse.json({ message: `Failed to get job status from Azure: ${errorText}` }, { status: statusResponse.status });
    }

    const statusData = await statusResponse.json() as AzureTranscriptionStatusResponse;

    if (statusData.status === "Succeeded") {
      if (!statusData.links?.files) {
        return NextResponse.json({ status: "Succeeded", message: "Result files link is missing in Azure response." }, { status: 500 });
      }
      
      const filesListResponse = await fetch(statusData.links.files, { headers: { 'Ocp-Apim-Subscription-Key': SPEECH_KEY }});
      if (!filesListResponse.ok) {
        const errorText = await filesListResponse.text();
        return NextResponse.json({ status: "Succeeded", message: `Failed to get transcription files list from Azure: ${errorText}` }, { status: filesListResponse.status });
      }
      
      const filesData = await filesListResponse.json() as AzureTranscriptionFilesResponse;
      const resultFile = filesData.values.find(f => f.kind === "Transcription");

      if (resultFile?.links.contentUrl) {
        const transcriptContentResponse = await fetch(resultFile.links.contentUrl);
        if (!transcriptContentResponse.ok) {
          const errorText = await transcriptContentResponse.text();
          return NextResponse.json({ status: "Succeeded", message: `Failed to download transcript content from Azure: ${errorText}` }, { status: transcriptContentResponse.status });
        }
        
        const transcriptJson = await transcriptContentResponse.json() as TranscriptionResult;

        let summaryText: string | null = null;
        if (geminiModel) { 
            const fullTranscribedText = extractTextFromTranscript(transcriptJson);
            if (fullTranscribedText) {
                summaryText = await getSummaryFromGemini(fullTranscribedText);
            } else {
                summaryText = "Transcription text was empty, no summary generated.";
            }
        } else {
            summaryText = "Gemini client not initialized (check API key). Summary not generated.";
        }

        return NextResponse.json({ 
            status: "Succeeded", 
            transcript: transcriptJson,
            summary: summaryText 
        });
      } else { 
        return NextResponse.json({ status: "Succeeded", message: "Transcription result file link not found in Azure response." }, { status: 404 });
      }
    } else if (statusData.status === "Failed") {
        return NextResponse.json({ status: "Failed", message: statusData.properties?.error?.message || "Azure job failed." });
    } else {
      return NextResponse.json({ status: statusData.status }); // Running, NotStarted
    }
  } catch (error: any) {
    console.error('Critical error in /api/transcription-status:', error);
    return NextResponse.json({ message: `Internal server error in status check: ${error.message || String(error)}` }, { status: 500 });
  }
}