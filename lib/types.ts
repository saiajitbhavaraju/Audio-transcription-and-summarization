
// For Azure Batch Transcription Service API
export interface AzureTranscriptionProperties {
  diarizationEnabled?: boolean;
  wordLevelTimestampsEnabled?: boolean;
  punctuationMode?: string;
  profanityFilterMode?: string;
  // Add other properties as needed by the Azure API
}

export interface AzureTranscriptionRequest {
  contentUrls: string[];
  locale: string;
  displayName: string;
  properties: AzureTranscriptionProperties;
  // model?: { self: string }; // For custom models
}

export interface AzureTranscriptionCreationResponse {
  self: string; // URL to the transcription job, contains the ID
  // other properties from Azure...
}

export interface AzureTranscriptionStatusResponse {
  self: string;
  status: "NotStarted" | "Running" | "Succeeded" | "Failed";
  properties?: {
    error?: {
      code: string;
      message: string;
    };
  };
  links?: {
    files: string; // URL to get list of files
  };
  // other properties...
}

export interface AzureTranscriptionFileLink {
  name: string;
  kind: "Transcription" | "Audio" | "Diarization" | string;
  links: {
    contentUrl: string; // This is the SAS URL to the result file
  };
  // other properties...
}

export interface AzureTranscriptionFilesResponse {
  values: AzureTranscriptionFileLink[];
  // other properties...
}

// For the actual transcription result JSON structure
export interface WordDetail {
  word: string;
  offset: string; // e.g., "PT0.7S" or can be ticks
  duration: string; // e.g., "PT0.3S" or can be ticks
  offsetInTicks: number;
  durationInTicks: number;
  confidence?: number;
  display?: string; // Azure might use 'Text' or 'Word'
}

export interface NBest {
  confidence: number;
  lexical: string;
  itn: string;
  maskedITN: string;
  display: string;
  words?: WordDetail[];
}

export interface RecognizedPhrase {
  recognitionStatus: "Success" | "Failure" | string;
  channel?: number;
  speaker?: number; // Diarization output
  offset: string; // e.g. "PT0S"
  duration: string; // e.g. "PT5.37S"
  offsetInTicks: number;
  durationInTicks: number;
  nBest: NBest[];
}

export interface TranscriptionResult { // This is what your frontend will mainly work with
  source: string; // URL of the audio source
  timestamp: string; // ISO 8601 timestamp of the transcription job
  duration: string; // Total duration of the audio
  recognizedPhrases: RecognizedPhrase[];
  // other properties like audioFileName, combinedRecognizedPhrases...
}

// For your frontend API communication with your Next.js backend
export interface ApiTranscribeResponseData {
  transcriptionId?: string;
  transcriptionLocationUrl?: string; // URL to check status
  message?: string;
  // No audioPlaybackUrl needed if using public GitHub URL directly in frontend
}

export interface ApiTranscriptionStatusData {
  status: "Succeeded" | "Failed" | "Running" | "NotStarted";
  transcript?: TranscriptionResult;
  message?: string;
}