/**
 * Voice Activation System
 * SpeechRecognition API for TAE command input
 * 
 * Commands:
 * - "TAE"
 * - "TAE, enter Demo Mode"
 * - "Open Identity"
 * - "Open Syncori"
 * - "Return Home"
 */

import { useEffect, useState, useCallback, useRef } from 'react';

const SpeechRecognition = typeof window !== 'undefined' && 
  (window.SpeechRecognition || (window as any).webkitSpeechRecognition);

export interface VoiceCommand {
  text: string;
  confidence: number;
  matched: boolean;
}

const VOICE_COMMANDS = [
  'tae',
  'tae enter demo mode',
  'tae demo mode',
  'open identity',
  'open syncori',
  'return home',
  'demo mode',
  'activate',
  'listen',
];

export function useVoiceActivation(onCommand: (command: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!SpeechRecognition) {
      console.log('[Voice] SpeechRecognition API unavailable');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      console.log('[Voice] Listening started');
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log('[Voice] Listening stopped');
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase().trim();
        const confidence = event.results[i][0].confidence;

        if (event.results[i].isFinal) {
          isFinal = true;
          // Check for command match
          const matched = VOICE_COMMANDS.some(cmd => transcript.includes(cmd));

          if (matched) {
            // Route to TAE
            if (transcript.includes('demo')) {
              onCommand('demo mode');
            } else if (transcript.includes('identity')) {
              onCommand('open identity');
            } else if (transcript.includes('syncori')) {
              onCommand('open syncori');
            } else if (transcript.includes('home')) {
              onCommand('return home');
            } else if (transcript.includes('tae')) {
              onCommand('tae');
            }

            setLastCommand({
              text: transcript,
              confidence: confidence,
              matched: true,
            });

            console.log(`[Voice] Matched: "${transcript}" (confidence: ${confidence.toFixed(2)})`);
          } else {
            setLastCommand({
              text: transcript,
              confidence: confidence,
              matched: false,
            });
          }
        } else {
          interimTranscript += transcript + ' ';
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.log('[Voice] Error:', event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onCommand]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.log('[Voice] Already listening');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
  }, []);

  return {
    isListening,
    lastCommand,
    startListening,
    stopListening,
    isSupported: !!SpeechRecognition,
  };
}
