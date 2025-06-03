// app/api/debug-summarize/route.ts
import { NextResponse } from 'next/server';

// --- Re-use or import Gemini initialization and summary function ---
// Option A: Copy-paste the Gemini client init and getSummaryFromGemini function here
// Option B (Better for larger apps): Move them to a shared utils file and import.
// For this example, let's assume you might copy the relevant parts or have them accessible.

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, type SafetySetting } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let genAI_debug: GoogleGenerativeAI | null = null;
let geminiModel_debug: any = null;

if (GEMINI_API_KEY) {
  try {
    genAI_debug = new GoogleGenerativeAI(GEMINI_API_KEY);
    // *** IMPORTANT: Use the Gemini model name you are currently testing/debugging with ***
    // For example, if you were testing "gemini-1.5-pro-preview-0506" or "gemini-1.0-pro"
    geminiModel_debug = genAI_debug.getGenerativeModel({ model: "gemini-2.0-flash" }); // Or your target model
  } catch (error) {
    console.error("Failed to initialize Gemini AI Client for debug route:", error);
  }
} else {
  console.warn("GEMINI_API_KEY not found. Debug summarization will not work.");
}

async function getSummaryFromGemini_debug(text: string): Promise<string | null> {
  if (!geminiModel_debug) {
    return "Debug Summarizer: Gemini model not initialized (check API key and model name).";
  }
  if (!text.trim()) {
    return "Debug Summarizer: No text provided.";
  }

  const generationConfig = { /* ... your preferred config ... */ };
    const safetySettings: SafetySetting[] = [ // <--- APPLY THE TYPE HERE
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ];
  try {
    const prompt = `Provide a concise summary of the following text:\n\n"${text}"\n\nSummary:`;
    console.log("DEBUG API: Sending text to Gemini (first 100 chars):", text.substring(0,100));

    const result = await geminiModel_debug.generateContent({
        contents: [{ role: "user", parts: [{text: prompt}]}],
        generationConfig,
        safetySettings,
    });
    const response = result.response;

    console.log("DEBUG API: Full Gemini Response Object:", JSON.stringify(response, null, 2)); 
    console.log("DEBUG API: Gemini Prompt Feedback:", JSON.stringify(response.promptFeedback, null, 2));

    if (response.promptFeedback?.blockReason) {
        return `Debug Summary blocked: ${response.promptFeedback.blockReason}`;
    }
    if (response.candidates && response.candidates.length > 0 &&
        response.candidates[0].content && response.candidates[0].content.parts &&
        response.candidates[0].content.parts.length > 0 && 
        response.candidates[0].content.parts[0].text) {
        return response.candidates[0].content.parts[0].text;
    } else if (typeof response.text === 'function' && response.text()) {
        return response.text();
    } else {
        console.error("DEBUG API: No content in Gemini response or unexpected structure. Full response logged above.");
        return "Debug Summary generation failed: Could not extract text from response.";
    }
  } catch (error: any) {
    console.error("DEBUG API: Error calling Gemini API:", error.message);
    return `Debug Summary Error: ${error.message || "Unknown error"}`;
  }
}
// --- End re-used/copied Gemini logic ---


export async function POST(request: Request) {
  console.log("--- /api/debug-summarize endpoint hit ---");

  if (!GEMINI_API_KEY || !geminiModel_debug) {
    return NextResponse.json({ error: "Gemini service not configured on the server." }, { status: 500 });
  }

  try {
    const { textToSummarize } = await request.json();

    if (!textToSummarize || typeof textToSummarize !== 'string' || !textToSummarize.trim()) {
      return NextResponse.json({ error: 'Missing or empty textToSummarize in request body.' }, { status: 400 });
    }

    const summary = await getSummaryFromGemini_debug(textToSummarize);

    if (summary && !summary.startsWith("Debug Summary Error:") && !summary.startsWith("Debug Summary blocked:") && !summary.startsWith("Debug Summarizer: Gemini model not initialized") && !summary.startsWith("Debug Summary generation failed:")) {
      return NextResponse.json({ summary: summary });
    } else {
      // If getSummaryFromGemini_debug returns an error message, pass it along but maybe with a different status
      return NextResponse.json({ error: summary || "Failed to generate summary for an unknown reason." }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error in /api/debug-summarize:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message || String(error)}` }, { status: 500 });
  }
}