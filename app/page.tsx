// app/page.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AudioPlayer from '@/components/AudioPlayer'; // Verify this path
import type {
  TranscriptionResult,
  RecognizedPhrase, 
  WordDetail,      
} from '@/lib/types'; // Verify this path

// Type for the response from /api/transcribe
interface ApiTranscribeResponseData {
    transcriptionId?: string;
    transcriptionLocationUrl?: string;
    message?: string;
}

// More specific type for the data expected from /api/transcription-status
interface TranscriptionStatusWithSummaryData {
  status: "Succeeded" | "Failed" | "Running" | "NotStarted";
  transcript?: TranscriptionResult;
  summary?: string | null;
  message?: string;
}

export default function HomePage() {
  const [githubUrlInput, setGithubUrlInput] = useState<string>('');
  const [transcriptionJobDetails, setTranscriptionJobDetails] = useState<{ id: string, locationUrl: string } | null>(null);
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [speakerMappings, setSpeakerMappings] = useState<Record<number, string>>({});
  const [maxSpeakersInput, setMaxSpeakersInput] = useState<number>(5);

  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false); 

// // --- ADD THESE STATE DECLARATIONS FOR THE DEBUG SECTION ---
//   const [debugInputText, setDebugInputText] = useState<string>('');
//   const [debugSummaryOutput, setDebugSummaryOutput] = useState<string | null>(null);
//   const [isDebugSummarizing, setIsDebugSummarizing] = useState<boolean>(false);
//   const [debugSummaryError, setDebugSummaryError] = useState<string | null>(null);
//   // --- END OF NEW STATE DECLARATIONS ---

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const phraseRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState<number | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);


  const handleSubmitGithubUrl = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!githubUrlInput) {
      setTranscriptionError("Please enter a GitHub raw audio URL.");
      return;
    }
    setIsLoading(true);
    setIsSummarizing(false); 
    setSummaryText(null);    
    setTranscriptionError(null);
    setTranscriptionResult(null);
    setTranscriptionJobDetails(null);
    setSpeakerMappings({});
    setCurrentPhraseIndex(null);
    setActiveWordIndex(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicAudioUrl: githubUrlInput,
          locale: "en-US", 
          maxSpeakers: Number(maxSpeakersInput) || 5, 
        }),
      });

      const data: ApiTranscribeResponseData = await response.json();
      if (response.ok && data.transcriptionId && data.transcriptionLocationUrl) {
        setTranscriptionJobDetails({ id: data.transcriptionId, locationUrl: data.transcriptionLocationUrl });
        setIsSummarizing(true); 
        pollingIntervalRef.current = setInterval(() => checkTranscriptionStatus(data.transcriptionLocationUrl!), 7000);
        checkTranscriptionStatus(data.transcriptionLocationUrl);
      } else {
        setTranscriptionError(data.message || "Failed to start transcription job.");
        setIsLoading(false);
        setIsSummarizing(false);
      }
    } catch (error: any) {
      setTranscriptionError(error.message || "Error submitting URL.");
      setIsLoading(false);
      setIsSummarizing(false);
    }
  };

  const checkTranscriptionStatus = useCallback(async (locationUrl: string) => {
    if (!locationUrl) return;
    
    try {
      const res = await fetch(`/api/transcription-status?locationUrl=${encodeURIComponent(locationUrl)}`);
      const data: TranscriptionStatusWithSummaryData = await res.json();

      if (data.status === "Succeeded" && data.transcript) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setTranscriptionResult(data.transcript);
        setSummaryText(data.summary || "Summary could not be generated or was not provided.");
        setIsSummarizing(false);
        setTranscriptionError(null);
        setIsLoading(false);
        
        const initialMappings: Record<number, string> = {};
        if (data.transcript?.recognizedPhrases) {
          const uniqueSpeakers = [...new Set(data.transcript.recognizedPhrases.map(p => p.speaker).filter(s => s !== undefined))] as number[];
          uniqueSpeakers.forEach(spId => { initialMappings[spId] = `Speaker ${spId}`; });
        }
        setSpeakerMappings(initialMappings);

      } else if (data.status === "Failed") {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setTranscriptionError(data.message || "Transcription failed.");
        setIsLoading(false);
        setIsSummarizing(false);
      } else if (data.status === "Running" || data.status === "NotStarted") {
        setIsLoading(true); 
        setIsSummarizing(true); 
      } else {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setTranscriptionError(`Unexpected status: ${data.status || 'Unknown'}`);
        setIsLoading(false);
        setIsSummarizing(false);
      }
    } catch (error: any) {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      setTranscriptionError(`Error polling status: ${error.message}`);
      setIsLoading(false);
      setIsSummarizing(false);
    }
  }, []); 

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  const handleSpeakerNameChange = (speakerId: number, newName: string) => {
    setSpeakerMappings(prev => ({ ...prev, [speakerId]: newName }));
  };

  const downloadFile = (content: string, baseFilename: string, extension: string = 'txt') => {
    if (!content) {
      alert(`No ${baseFilename} data to download.`);
      return;
    }
    const blob = new Blob([content], { type: `text/plain;charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${baseFilename}-${transcriptionJobDetails?.id?.substring(0,8) || 'file'}.${extension}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const downloadTranscriptText = () => {
    if (!transcriptionResult?.recognizedPhrases) {
      alert("No transcript data to download.");
      return;
    }
    let textContent = "Timestamp\tSpeaker\tText\n";
    transcriptionResult.recognizedPhrases.forEach((phrase: RecognizedPhrase) => {
      const speakerLabel = phrase.speaker !== undefined
        ? (speakerMappings[phrase.speaker] || `Speaker ${phrase.speaker}`)
        : "Unknown";
      const startTimeSeconds = (phrase.offsetInTicks / 10000000).toFixed(2);
      textContent += `${startTimeSeconds}s\t${speakerLabel}\t${phrase.nBest[0].display}\n`;
    });
    downloadFile(textContent, "transcript");
  };

  const downloadSummaryText = () => {
    if (!summaryText) {
      alert("No summary data to download.");
      return;
    }
    downloadFile(summaryText, "summary");
  };

  const handleAudioTimeUpdate = (currentTime: number) => {
    if (!transcriptionResult?.recognizedPhrases) return;
    let currentPIndex = -1;
    let currentWIndex = -1;

    for (let i = 0; i < transcriptionResult.recognizedPhrases.length; i++) {
        const phrase = transcriptionResult.recognizedPhrases[i];
        const phraseStartTime = phrase.offsetInTicks / 10000000;
        const phraseEndTime = (phrase.offsetInTicks + phrase.durationInTicks) / 10000000;

        if (currentTime >= phraseStartTime && currentTime <= phraseEndTime) {
            currentPIndex = i;
            if (phrase.nBest[0].words) {
                for (let j = 0; j < phrase.nBest[0].words.length; j++) {
                    const word = phrase.nBest[0].words[j];
                    const wordStartTime = word.offsetInTicks / 10000000;
                    const wordEndTime = (word.offsetInTicks + word.durationInTicks * 1.1) / 10000000; 
                    if (currentTime >= wordStartTime && currentTime < wordEndTime) {
                        currentWIndex = j;
                        break;
                    }
                }
            }
            break; 
        }
    }
    
    if (currentPIndex !== currentPhraseIndex) {
        setCurrentPhraseIndex(currentPIndex);
        if (currentPIndex !== -1 && phraseRefs.current[currentPIndex]) {
            phraseRefs.current[currentPIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    setActiveWordIndex(currentWIndex);
  };

  const seekAudio = (timeInSeconds: number) => {
    const audioElement = document.querySelector('audio'); 
    if (audioElement) {
        audioElement.currentTime = timeInSeconds;
        audioElement.play().catch(e => console.warn("Audio play interrupted or failed:", e));
    }
  };

// // --- New Function for Debugging Gemini ---
//   const handleDebugSummarize = async () => {
//     if (!debugInputText.trim()) {
//       setDebugSummaryError("Please paste some text to summarize.");
//       return;
//     }
//     setIsDebugSummarizing(true);
//     setDebugSummaryOutput(null);
//     setDebugSummaryError(null);

//     try {
//       const response = await fetch('/api/debug-summarize', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ textToSummarize: debugInputText }),
//       });

//       const data = await response.json();

//       if (response.ok) {
//         setDebugSummaryOutput(data.summary);
//       } else {
//         setDebugSummaryError(data.error || "Failed to get summary from debug API.");
//       }
//     } catch (error: any) {
//       setDebugSummaryError(error.message || "Error calling debug summary API.");
//     } finally {
//       setIsDebugSummarizing(false);
//     }
//   };
//   // --- End New Function ---

  return (
    <main className="container mx-auto p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col items-center">
      <div className="w-full max-w-3xl space-y-8">
        <header className="text-center py-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-indigo-600 dark:text-indigo-400">
            Azure Speech Transcription & Summary
          </h1>
          <p className="text-md sm:text-lg text-gray-600 dark:text-gray-400 mt-2">
            Enter a public audio URL (e.g., GitHub raw link) to get its transcription and summary.
          </p>
        </header>

        <section className="p-6 bg-white dark:bg-gray-800 shadow-xl rounded-xl">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            1. Provide Audio URL & Options
          </h2>
          <form onSubmit={handleSubmitGithubUrl} className="space-y-6">
            <div>
              <label htmlFor="githubUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Public Audio URL
              </label>
              <input
                id="githubUrl"
                type="url"
                value={githubUrlInput}
                onChange={(e) => setGithubUrlInput(e.target.value)}
                placeholder="https://raw.githubusercontent.com/.../audio.wav"
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="maxSpeakers" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Max Speakers Expected (1-10)
              </label>
              <input
                id="maxSpeakers"
                type="number"
                value={maxSpeakersInput}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (e.target.value === '') {
                    setMaxSpeakersInput(1); 
                  } else if (val >= 1 && val <= 10) { 
                    setMaxSpeakersInput(val);
                  }
                }}
                min="1"
                max="10" 
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
           
            <button
              type="submit"
              disabled={isLoading || isSummarizing} // Disable if either is in progress
              className="w-full px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 transition duration-150 ease-in-out"
            >
              {(isLoading || isSummarizing) ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isLoading && !transcriptionResult ? "Transcribing..." : "Summarizing..."}
                </div>
              ) : 'Get Transcription & Summary'}
            </button>
          </form>
        </section>

        {(isLoading || isSummarizing) && !transcriptionResult && !summaryText && !transcriptionError && (
          <div className="mt-6 p-4 text-center text-indigo-700 dark:text-indigo-300">
            <p>
                {isLoading && !transcriptionResult ? "Transcription in progress..." : ""}
                {isSummarizing && transcriptionResult && !summaryText ? "Generating summary..." : ""}
                {!isLoading && isSummarizing && !transcriptionResult ? "Preparing for summarization..." : ""}
                 (This can take some time)
            </p>
            {transcriptionJobDetails?.id && <p className="text-sm text-gray-500 dark:text-gray-400">Job ID: {transcriptionJobDetails.id}</p>}
          </div>
        )}

        {transcriptionError && (
          <div className="mt-6 p-4 bg-red-100 dark:bg-red-800/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 rounded-lg">
            <p><strong>Error:</strong> {transcriptionError}</p>
          </div>
        )}
        
        {githubUrlInput && (!isLoading || transcriptionResult) && !transcriptionError && ( 
          <section className="mt-6 p-6 bg-white dark:bg-gray-800 shadow-xl rounded-xl">
             <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Audio Preview
             </h2>
             <AudioPlayer audioSrc={githubUrlInput} className="mt-2" onTimeUpdate={handleAudioTimeUpdate} />
          </section>
        )}


        {transcriptionResult && transcriptionResult.recognizedPhrases && (
          <section className="mt-6 p-6 bg-white dark:bg-gray-800 shadow-xl rounded-xl space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
                Transcription Results
              </h2>
              <button
                onClick={downloadTranscriptText}
                className="mt-3 sm:mt-0 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
              >
                Download Transcript (.txt)
              </button>
            </div>

            {Object.keys(speakerMappings).length > 0 && (
              <div className="my-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600">
                <h3 className="text-md font-semibold text-gray-600 dark:text-gray-300 mb-2">Rename Speakers:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(speakerMappings).map(([id, name]) => (
                    <div key={id} className="flex items-center space-x-2">
                      <label htmlFor={`speaker-${id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {`Speaker ${id}:`}
                      </label>
                      <input
                        id={`speaker-${id}`}
                        type="text"
                        value={name}
                        onChange={(e) => handleSpeakerNameChange(Number(id), e.target.value)}
                        className="block w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="prose prose-sm sm:prose dark:prose-invert max-w-none border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-h-[60vh] overflow-y-auto bg-gray-50 dark:bg-gray-800/50">
              {transcriptionResult.recognizedPhrases.map((phrase, pIndex) => (
                <div
                  key={pIndex}
                  ref={el => { phraseRefs.current[pIndex] = el; }}
                  className={`mb-3 p-2 rounded-md cursor-pointer transition-all duration-150 ${currentPhraseIndex === pIndex ? 'bg-indigo-100 dark:bg-indigo-900 ring-1 ring-indigo-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  onClick={() => seekAudio(phrase.offsetInTicks / 10000000)}
                >
                  <p className="font-semibold text-indigo-700 dark:text-indigo-400">
                    <span className="text-xs text-gray-500 dark:text-gray-400 mr-2 font-mono">
                      [{ (phrase.offsetInTicks / 10000000).toFixed(2) }s]
                    </span>
                    {phrase.speaker !== undefined ? (speakerMappings[phrase.speaker] || `Speaker ${phrase.speaker}`) : 'Unknown'}:
                  </p>
                  <p className="ml-4 text-gray-800 dark:text-gray-200">
                    {phrase.nBest[0].words ? phrase.nBest[0].words.map((word: WordDetail, wIndex: number) => (
                        <span 
                            key={wIndex} 
                            className={`cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-600/50 rounded px-0.5 ${currentPhraseIndex === pIndex && activeWordIndex === wIndex ? 'bg-yellow-300 dark:bg-yellow-500/70 font-bold' : ''}`}
                            onClick={(e) => { e.stopPropagation(); seekAudio(word.offsetInTicks / 10000000); }}
                        >
                        {word.display || word.word}{' '}
                        </span>
                    )) : phrase.nBest[0].display}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Display Summary Section (only if summaryText has a value) */}
        {summaryText && (
          <section className="mt-6 p-6 bg-white dark:bg-gray-800 shadow-xl rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
                Summary
              </h2>
              <button
                onClick={downloadSummaryText}
                className="mt-3 sm:mt-0 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
              >
                Download Summary (.txt)
              </button>
            </div>
            <div className="prose prose-sm sm:prose dark:prose-invert max-w-none border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
              {summaryText.split('\n').map((line, index) => (
                <p key={index} className="mb-2 last:mb-0">{line || <>&nbsp;</>}</p>
              ))}
            </div>
          </section>
        )}
      

        
      
      </div>
    </main>
  );
}