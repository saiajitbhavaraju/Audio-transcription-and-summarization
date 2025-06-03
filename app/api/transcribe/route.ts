// app/api/transcribe/route.ts
import { NextResponse } from 'next/server';
import type { AzureTranscriptionRequest, AzureTranscriptionCreationResponse } from '@/lib/types';

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const BATCH_TRANSCRIPTION_API_VERSION = "v3.1"; // Or newer like v3.2-preview.1
const SERVICE_ENDPOINT = `https://${SPEECH_REGION}.cris.ai/api/speechtotext/${BATCH_TRANSCRIPTION_API_VERSION}/transcriptions`;

export async function POST(request: Request) {
  if (!SPEECH_KEY || !SPEECH_REGION) {
    console.error("Azure Speech credentials not set.");
    return NextResponse.json({ message: "Server configuration error for Speech service." }, { status: 500 });
  }

  try {
    const { 
      publicAudioUrl, 
      locale = "en-IN", 
      punctuationMode = "DictatedAndAutomatic", // Default punctuation mode
      diarizationEnabled = true, // Default to true
      minSpeakers = 1,         // Default min speakers
      maxSpeakers = 20          // Default max speakers (example)
    } = await request.json();

    if (!publicAudioUrl || typeof publicAudioUrl !== 'string') {
      return NextResponse.json({ message: 'Missing or invalid publicAudioUrl in request body.' }, { status: 400 });
    }

    const transcriptionDefinition: AzureTranscriptionRequest = {
      contentUrls: [publicAudioUrl],
      locale: locale,
      displayName: `Customized Transcription Test - ${new Date().toISOString()}`,
      properties: {
        // Diarization settings including max number of speakers
        diarizationEnabled: diarizationEnabled, // Use value from request or default
        ...(diarizationEnabled && { // Conditionally add diarization object
          diarization: {
            speakers: {
              minCount: minSpeakers, // Use value from request or default
              maxCount: maxSpeakers, // Use value from request or default
            },
          },
        }),
        
        // Punctuation mode
        punctuationMode: punctuationMode, // Use value from request or default

        // Other existing or new properties
        wordLevelTimestampsEnabled: true,
        profanityFilterMode: "Masked",
        // sentenceLevelTimestampsEnabled: true, // Example of another option
      },
    };

    const createResponse = await fetch(SERVICE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': SPEECH_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transcriptionDefinition),
    });

    if (!createResponse.ok) {
      const errorBody = await createResponse.text();
      console.error('Azure transcription creation API failed:', createResponse.status, errorBody);
      return NextResponse.json({ message: `Azure transcription creation failed: ${errorBody}` }, { status: createResponse.status });
    }

    const creationResult = await createResponse.json() as AzureTranscriptionCreationResponse;
    const transcriptionLocationUrl = creationResult.self;
    const transcriptionId = transcriptionLocationUrl.split('/').pop();

    console.log("Batch Transcription Job created:", transcriptionId, "Location URL:", transcriptionLocationUrl, "with custom properties.");

    return NextResponse.json({
      message: 'Transcription job successfully started with custom parameters.',
      transcriptionId: transcriptionId,
      transcriptionLocationUrl: transcriptionLocationUrl,
    });

  } catch (error: any) {
    console.error('Error in /api/transcribe:', error);
    return NextResponse.json({ message: `Internal server error: ${error.message || String(error)}` }, { status: 500 });
  }
}