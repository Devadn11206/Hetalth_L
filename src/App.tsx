import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, AlertCircle, HeartPulse, Stethoscope, Apple, Moon, Activity, Info, WifiOff, MessageSquare, BookOpen, Droplets, ShieldCheck, Bug, Baby, Bell, Plus, Trash2, Clock, Search, X, CheckCircle, Volume2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { get, set } from 'idb-keyval';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ContentFields {
  possibleIssue: string;
  advice: string;
  nutritionPlan: string;
  lifestyle: string;
  whenToSeeDoctor: string;
}

interface AssessmentData {
  detectedLanguage: string;
  urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  localContent: ContentFields;
  englishContent: ContentFields;
  disclaimer: string;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  parsedData?: AssessmentData;
}

const SYSTEM_INSTRUCTION = `You are an AI Health Assistant designed for rural and multilingual users in India.

-----------------------
SUPPORTED LANGUAGES
-----------------------
- English
- Hindi
- Telugu
- Tamil
- Kannada
- Malayalam

-----------------------
LANGUAGE HANDLING
-----------------------
1. Detect the language of the user's input automatically.
2. Respond in:
   - The SAME language as the user input
   - AND also provide a simple English version

Example:
If user speaks in Telugu -> reply in Telugu + English
If user speaks in Hindi -> reply in Hindi + English

3. If input is mixed (e.g., Hinglish or Telugu-English):
   - Understand intent correctly
   - Respond in the dominant language + English

-----------------------
CAPABILITIES
-----------------------
- Answer basic health questions
- Perform symptom analysis (basic triage only)
- Suggest nutrition plans
- Provide lifestyle recommendations

-----------------------
SYMPTOM TRIAGE
-----------------------
- Suggest possible conditions (NO diagnosis)
- Assign urgency: LOW / MEDIUM / HIGH

HIGH symptoms:
- chest pain
- breathing difficulty
- heavy bleeding
- unconsciousness

If HIGH:
⚠️ This may be serious. Seek medical help immediately.

-----------------------
NUTRITION PLAN (INDIAN DIET & DISHES)
-----------------------
- Suggest a structured everyday Indian diet specific to the user's condition.
- Format strictly as a daily planner (e.g., Breakfast, Lunch, Dinner, Snacks).
- Emphasize simple, highly accessible, and affordable local Indian foods (e.g., Khichdi, Dal, Roti, Idli, Rasam, simple Sabzis, local seasonal fruits).
- Clearly list:
  - What to eat (beneficial foods for recovery).
  - What to avoid.
  - Hydration tips (e.g., Jeera water, Tulsi tea, or simple warm water).

-----------------------
LIFESTYLE & RECOVERY
-----------------------
- Provide holistic Indian lifestyle recommendations.
- Include Sleep (e.g., 7-8 hours, early to bed), Physical activity (e.g., light walking, specific basic Yoga asanas if safe, Pranayama/breathing exercises).
- Stress reduction and natural home remedies that complement the diet.

-----------------------
SAFETY RULES
-----------------------
- Do NOT diagnose
- Do NOT prescribe medicines
- Keep answers simple and clear

-----------------------
STYLE
-----------------------
- Use simple words (for rural users)
- Be calm, supportive, and easy to understand
- Avoid complex medical terminology

-----------------------
IMPORTANT
-----------------------
You are an assistant, not a doctor.
Always prioritize safety and clarity.
Fill out the provided JSON schema accurately. Populate 'localContent' using the language you detected, and 'englishContent' with the English translation. If the detected language is English, just populate localContent in English and leave englishContent blank or duplicate it. For queries that are not symptom-related, you can leave diagnosis-specific fields empty or say "Not applicable".`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    detectedLanguage: { type: Type.STRING, description: "The language detected from the user input (e.g., Telugu, Hindi, English)" },
    urgencyLevel: { type: Type.STRING, description: "Must be LOW, MEDIUM, or HIGH" },
    localContent: {
      type: Type.OBJECT,
      properties: {
        possibleIssue: { type: Type.STRING, description: "Condition/issue in local language" },
        advice: { type: Type.STRING, description: "Advice in local language" },
        nutritionPlan: { type: Type.STRING, description: "Nutrition in local language" },
        lifestyle: { type: Type.STRING, description: "Lifestyle in local language" },
        whenToSeeDoctor: { type: Type.STRING, description: "Doctor logic in local language" }
      },
      required: ["possibleIssue", "advice", "nutritionPlan", "lifestyle", "whenToSeeDoctor"]
    },
    englishContent: {
      type: Type.OBJECT,
      properties: {
        possibleIssue: { type: Type.STRING, description: "Condition/issue in English" },
        advice: { type: Type.STRING, description: "Advice in English" },
        nutritionPlan: { type: Type.STRING, description: "Nutrition in English" },
        lifestyle: { type: Type.STRING, description: "Lifestyle in English" },
        whenToSeeDoctor: { type: Type.STRING, description: "Doctor logic in English" }
      },
      required: ["possibleIssue", "advice", "nutritionPlan", "lifestyle", "whenToSeeDoctor"]
    },
    disclaimer: { type: Type.STRING, description: "Always include: This is not a medical diagnosis. Consult a qualified doctor." }
  },
  required: ["detectedLanguage", "urgencyLevel", "localContent", "englishContent", "disclaimer"]
};

export interface Reminder {
  id: string;
  name: string;
  dosage: string;
  time: string;
  active: boolean;
}

const uiTranslations: Record<string, any> = {
  'en-IN': {
    title: "Health Assistant",
    listening: "Listening...",
    inputPlaceholder: "Type your questions or speak...",
    medTime: "Time for Medication!",
    tookIt: "I Took It",
    reminder: "Medication Reminder",
    searchPlaceholder: "Search conversation history...",
    addReminderDesc: "Set schedules for your prescriptions. The app will notify you when it's time to take your medications."
  },
  'hi-IN': {
    title: "स्वास्थ्य सहायक",
    listening: "सुन रहे हैं...",
    inputPlaceholder: "अपने प्रश्न टाइप करें या बोलें...",
    medTime: "दवा का समय!",
    tookIt: "मैंने ले लिया",
    reminder: "दवा अनुस्मारक",
    searchPlaceholder: "बातचीत इतिहास खोजें...",
    addReminderDesc: "चिकित्सकीय पर्चे (नुस्खे) के लिए समय निर्धारित करें।"
  },
  'te-IN': {
    title: "ఆరోగ్య సహాయకుడు",
    listening: "వింటున్నారు...",
    inputPlaceholder: "మీ ప్రశ్నలను టైప్ చేయండి లేదా మాట్లాడండి... / ఇన్పుట్",
    medTime: "మందులు వేసుకునే సమయం!",
    tookIt: "తీసుకున్నాను",
    reminder: "మందులు రిమైండర్",
    searchPlaceholder: "క్రింద ఉన్న సంభాషణల్లో శోధించండి...",
    addReminderDesc: "దయచేసి మందుల సమయాలను సెట్ చేయండి. సమయం అయినప్పుడు మీకు నోటిఫికేషన్ వస్తుంది."
  },
  'ta-IN': {
    title: "சுகாதார உதவியாளர்",
    listening: "கேட்கிறது...",
    inputPlaceholder: "உங்கள் கேள்விகளை உள்ளிடவும் அல்லது பேசவும்...",
    medTime: "மருந்துக்கான நேரம்!",
    tookIt: "நான் எடுத்துக்கொண்டேன்",
    reminder: "மருந்து நினைவூட்டல்",
    searchPlaceholder: "உரையாடல் வரலாற்றைத் தேடுக...",
    addReminderDesc: "உங்கள் மருந்துகளுக்கான அட்டவணைகளை அமைக்கவும்."
  },
  'kn-IN': {
    title: "ಆರೋಗ್ಯ ಸಹಾಯಕ",
    listening: "ಆಲಿಸಲಾಗುತ್ತಿದೆ...",
    inputPlaceholder: "ನಿಮ್ಮ ಪ್ರಶ್ನೆಗಳನ್ನು ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ...",
    medTime: "ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ!",
    tookIt: "ನಾನು ತೆಗೆದುಕೊಂಡಿದ್ದೇನೆ",
    reminder: "ಔಷಧಿ ಜ್ಞಾಪನೆ",
    searchPlaceholder: "ಸಂಭಾಷಣೆ ಇತಿಹಾಸವನ್ನು ಹುಡುಕಿ...",
    addReminderDesc: "ನಿಮ್ಮ ಔಷಧಿಗಳ ಸಮಯವನ್ನು ಹೊಂದಿಸಿ."
  },
  'ml-IN': {
    title: "ആരോഗ്യ സഹായി",
    listening: "കേൾക്കുന്നു...",
    inputPlaceholder: "നിങ്ങളുടെ ചോദ്യങ്ങൾ ടൈപ്പ് ചെയ്യുക അല്ലെങ്കിൽ സംസാരിക്കുക...",
    medTime: "മരുന്ന് കഴിക്കേണ്ട സമയം!",
    tookIt: "ഞാൻ കൃത്യമായി കഴിച്ചു",
    reminder: "മരുന്ന് ഓർമ്മപ്പെടുത്തൽ",
    searchPlaceholder: "സംഭാഷണ ചരിത്രം തിരയുക...",
    addReminderDesc: "മരുന്നുകൾക്കുള്ള സമയം സജ്ജീകരിക്കുക."
  }
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isDBReady, setIsDBReady] = useState(false);
  const [input, setInput] = useState('');
  const [autoSpeakResponse, setAutoSpeakResponse] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimResult, setInterimResult] = useState('');
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [activeTab, setActiveTab] = useState<'chat' | 'tips' | 'reminders'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAlarms, setActiveAlarms] = useState<Reminder[]>([]);
  const [speechLang, setSpeechLang] = useState('te-IN');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Audio state refs for persistent prominent alarm
  const audioCtxRef = useRef<any>(null);
  const beepIntervalRef = useRef<number | null>(null);

  const startUrgentAlarm = () => {
    if (beepIntervalRef.current) return; // Already alarming
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;
      
      const playPulse = () => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
        
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        
        // Urgent Sawtooth tone
        osc.type = 'sawtooth';
        osc.frequency.value = 850; 
        
        const now = audioCtxRef.current.currentTime;
        gain.gain.setValueAtTime(0, now);
        
        // Rapid 3-beep pattern (0.6 seconds total)
        gain.gain.linearRampToValueAtTime(0.7, now + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        
        gain.gain.linearRampToValueAtTime(0.7, now + 0.25);
        gain.gain.linearRampToValueAtTime(0, now + 0.35);
        
        gain.gain.linearRampToValueAtTime(0.7, now + 0.45);
        gain.gain.linearRampToValueAtTime(0, now + 0.55);

        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        
        osc.start(now);
        osc.stop(now + 0.6);
      };

      playPulse();
      beepIntervalRef.current = window.setInterval(playPulse, 1000); // Repeat every second
    } catch(e) {
      console.error("Audio beep failed", e);
    }
  };

  const stopUrgentAlarm = () => {
    if (beepIntervalRef.current) {
      window.clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(console.error);
      audioCtxRef.current = null;
    }
  };
  
  const languageRef = useRef(speechLang);
  useEffect(() => {
    languageRef.current = speechLang;
  }, [speechLang]);

  const t = uiTranslations[speechLang] || uiTranslations['en-IN'];

  // Load history from IDB on mount
  useEffect(() => {
    async function loadCache() {
      try {
        const saved = await get<Message[]>('rural_health_messages');
        if (saved && saved.length > 0) {
          setMessages(saved);
        } else {
          setMessages([
            {
              id: 'welcome',
              role: 'model',
              text: '',
              parsedData: {
                detectedLanguage: 'English',
                urgencyLevel: 'LOW',
                localContent: {
                  possibleIssue: 'Welcome to the Rural Health Assistant.',
                  advice: 'Please tell me your symptoms, or ask me any health, nutrition, or lifestyle questions. I can intuitively understand English, Hindi, Telugu, Tamil, Kannada, and Malayalam.',
                  nutritionPlan: 'Not applicable',
                  lifestyle: 'Not applicable',
                  whenToSeeDoctor: 'Not applicable'
                },
                englishContent: {
                  possibleIssue: 'Welcome to the Rural Health Assistant.',
                  advice: 'Please tell me your symptoms, or ask me any health, nutrition, or lifestyle questions. I can intuitively understand English, Hindi, Telugu, Tamil, Kannada, and Malayalam.',
                  nutritionPlan: 'Not applicable',
                  lifestyle: 'Not applicable',
                  whenToSeeDoctor: 'Not applicable'
                },
                disclaimer: 'This is not a medical diagnosis. Consult a qualified doctor.'
              }
            }
          ]);
        }
      } catch (err) {
        console.error("IDB load error", err);
      } finally {
        setIsDBReady(true);
      }
    }
    loadCache();
  }, []);

  // Sync offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save history to IndexedDB automatically
  useEffect(() => {
    if (isDBReady && messages.length > 0) {
      set('rural_health_messages', messages).catch(console.error);
    }
  }, [messages, isDBReady]);

  // Global Reminder Check
  useEffect(() => {
    // Request notification permission if needed
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    const checkReminders = async () => {
      try {
        const savedReminders = await get<Reminder[]>('rural_health_reminders');
        if (!savedReminders || savedReminders.length === 0) return;
        
        const reminders = savedReminders;
        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0');
        const currentMinutes = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentHours}:${currentMinutes}`;
        
        // We only want to trigger once per minute.
        // We use seconds to only trigger closely to the start of the minute.
        if (now.getSeconds() < 10) {
          reminders.forEach(r => {
            if (r.active && r.time === currentTime) {
              
              setActiveAlarms(prev => {
                if (prev.some(alarm => alarm.id === r.id)) return prev;
                
                const currentLang = languageRef.current;
                const tr = uiTranslations[currentLang] || uiTranslations['en-IN'];

                // Trigger notification with requireInteraction for persistence
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(`⚠️ ${tr.reminder}`, {
                    body: `Time to take: ${r.name} (${r.dosage})`,
                    icon: '/favicon.ico',
                    requireInteraction: true // Keeps the OS notification visible until user interacts
                  });
                }
                
                // Fallback / additional auditory warning
                if ('speechSynthesis' in window) {
                  const utterance = new SpeechSynthesisUtterance(`Urgent reminder to take your medication: ${r.name}`);
                  utterance.rate = 0.9;
                  window.speechSynthesis.speak(utterance);
                }

                // Start prominent loud repeating beep
                startUrgentAlarm();

                return [...prev, r];
              });
            }
          });
        }
      } catch (e) {
        console.error("Failed to fetch reminders for check from IDB", e);
      }
    };

    const interval = setInterval(checkReminders, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Speech Recognition setup
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!searchQuery) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, searchQuery]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        
        // Dynamically set based on user's preference for optimal dictation
        recognition.lang = speechLang; 
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let tempInterim = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              tempInterim += event.results[i][0].transcript;
            }
          }

          if (finalTranscript) {
             setInput((prev) => prev + (prev ? ' ' : '') + finalTranscript);
             setAutoSpeakResponse(true);
          }
          setInterimResult(tempInterim);
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          setIsListening(false);
          setInterimResult('');
        };

        recognition.onend = () => {
          setIsListening(false);
          setInterimResult('');
        };

        recognitionRef.current = recognition;
      }
    }
  }, [speechLang]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Your browser does not support voice input.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimResult('');
      
      // Spoken confirmation - stopped
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Microphone stopped.");
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      }
    } else {
      // Spoken confirmation - started
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("I am listening.");
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      }

      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userText = input.trim();
    setInput('');
    
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimResult('');
    }

    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), role: 'user', text: userText }
    ];
    setMessages(newMessages);
    setIsTyping(true);

    if (isOffline) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'model',
            text: 'Offline mode active',
            parsedData: {
              possibleIssue: 'Network Offline',
              advice: 'You are currently offline. New queries cannot be processed right now, but you can read your previous conversation history.',
              nutritionPlan: 'Not applicable',
              lifestyle: 'Not applicable',
              urgencyLevel: 'LOW',
              whenToSeeDoctor: 'Not applicable',
              teluguExplanation: 'మీరు ప్రస్తుతం ఆఫ్‌లైన్‌లో ఉన్నారు. కొత్త ప్రశ్నలను ప్రాసెస్ చేయడం సాధ్యం కాదు, దయచేసి పాత సందేశాలను చదవండి.',
              disclaimer: 'This is not a medical diagnosis. Consult a qualified doctor.'
            }
          }
        ]);
        setIsTyping(false);
      }, 1000);
      return;
    }

    try {
      // Build conversation history for API
      // We skip the welcome message for standard history to save tokens if we want, or just include it.
      // Better to include it so context is maintained.
      const contents = newMessages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.role === 'model' ? JSON.stringify(msg.parsedData) : msg.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.2 // Lower temp for more reliable medical information formatting
        }
      });

      const responseText = response.text;
      const parsed = JSON.parse(responseText || "{}") as AssessmentData;

      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'model',
          text: responseText || '',
          parsedData: parsed
        }
      ]);

      if (autoSpeakResponse) {
        let textToRead = "";
        if (parsed.localContent) {
          textToRead = [
            parsed.localContent.possibleIssue,
            parsed.localContent.advice,
            parsed.localContent.whenToSeeDoctor
          ].filter(t => t && t !== 'Not applicable' && t !== 'None' && t !== 'NA').join(". ");
        } else {
          textToRead = responseText || "";
        }

        if (textToRead && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToRead);
          utterance.lang = languageRef.current;
          utterance.rate = 0.95;
          window.speechSynthesis.speak(utterance);
        }
        setAutoSpeakResponse(false); // reset after speaking
      }
    } catch (error) {
      console.error('Error generating response:', error);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'model',
          text: 'Error connecting to the assistant. Please try again.',
          parsedData: {
            possibleIssue: 'Error processing request.',
            advice: 'I encountered an error. Please try asking again.',
            nutritionPlan: 'Not applicable',
            lifestyle: 'Not applicable',
            urgencyLevel: 'LOW',
            whenToSeeDoctor: 'Not applicable',
            teluguExplanation: 'క్షమించండి, ఒక లోపం ఏర్పడింది. దయచేసి మళ్ళీ ప్రయత్నించండి.',
            disclaimer: 'This is not a medical diagnosis. Consult a qualified doctor.'
          }
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const filteredMessages = messages.filter(msg => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    if (msg.role === 'user') {
      return msg.text.toLowerCase().includes(query);
    }
    if (msg.parsedData) {
      const data = msg.parsedData;
      return (
        (data.localContent?.possibleIssue?.toLowerCase() || '').includes(query) ||
        (data.localContent?.advice?.toLowerCase() || '').includes(query) ||
        (data.localContent?.nutritionPlan?.toLowerCase() || '').includes(query) ||
        (data.localContent?.lifestyle?.toLowerCase() || '').includes(query) ||
        (data.englishContent?.possibleIssue?.toLowerCase() || '').includes(query) ||
        (data.englishContent?.advice?.toLowerCase() || '').includes(query) ||
        (data.englishContent?.nutritionPlan?.toLowerCase() || '').includes(query) ||
        (data.englishContent?.lifestyle?.toLowerCase() || '').includes(query)
      );
    }
    return false;
  });

  if (!isDBReady) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 items-center justify-center space-y-4">
        <Activity className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-emerald-800 font-medium animate-pulse">Loading offline data...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-emerald-800 text-white flex items-center justify-between px-6 shrink-0 shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <HeartPulse className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase flex items-center">
            Rural Health AI <span className="font-normal opacity-70 ml-2 hidden lg:inline-block">| {t.title}</span>
            {isOffline && (
              <span className="ml-3 bg-amber-500/20 text-amber-200 text-[10px] sm:text-xs px-2 py-1 rounded-md border border-amber-500/30 font-semibold flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> OFFLINE
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('chat')} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === 'chat' ? 'bg-emerald-700 text-white' : 'text-emerald-100 hover:bg-emerald-700/50'}`}
          >
            <MessageSquare className="w-4 h-4" /> <span className="hidden sm:inline">Consult</span>
          </button>
          <button 
            onClick={() => setActiveTab('tips')} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === 'tips' ? 'bg-emerald-700 text-white' : 'text-emerald-100 hover:bg-emerald-700/50'}`}
          >
            <BookOpen className="w-4 h-4" /> <span className="hidden sm:inline">Health Tips</span>
          </button>
          <button 
            onClick={() => setActiveTab('reminders')} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === 'reminders' ? 'bg-emerald-700 text-white' : 'text-emerald-100 hover:bg-emerald-700/50'}`}
          >
            <Bell className="w-4 h-4" /> <span className="hidden sm:inline">Reminders</span>
          </button>
        </div>
      </header>

      {/* Search Bar for Chat History */}
      {activeTab === 'chat' && messages.length > 1 && (
        <div className="bg-white border-b border-slate-200 py-3 px-6 shrink-0 flex justify-center shadow-sm relative z-0">
           <div className="relative w-full max-w-4xl">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input
               type="text"
               placeholder={t.searchPlaceholder}
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-10 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-700 transition-colors"
             />
             {searchQuery && (
               <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                 <X className="w-4 h-4" />
               </button>
             )}
           </div>
        </div>
      )}

      {/* Chat Area */}
      <main className={`flex-grow overflow-y-auto p-6 w-full max-w-4xl mx-auto space-y-6 ${activeTab === 'chat' ? '' : 'hidden'}`}>
        {filteredMessages.length === 0 && searchQuery && (
          <div className="text-center p-12 bg-white border border-slate-200 rounded-xl border-dashed">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No results found for "{searchQuery}"</p>
          </div>
        )}
        {filteredMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="bg-white border border-slate-200 text-slate-700 px-5 py-4 rounded-xl rounded-tr-sm max-w-[85%] shadow-sm text-sm italic leading-relaxed">
                {msg.text}
              </div>
            ) : (
              <div className="w-full max-w-full md:max-w-[95%]">
                <AssessmentCard data={msg.parsedData!} />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-100 p-4 flex items-center justify-between border border-slate-200 rounded-xl rounded-tl-sm shadow-sm gap-4 text-slate-700 max-w-[85%]">
              <div className="flex items-center gap-3">
                 <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                 <span className="text-sm font-medium text-slate-700">{t.listening}</span>
              </div>
              <Activity className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className={`bg-white border-t border-slate-200 p-4 shrink-0 relative ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
        <div className="max-w-4xl mx-auto flex items-end gap-3 relative">
          
          {/* Visual Feedback Overlay for Voice */}
          {isListening && (
            <div className="absolute bottom-full left-0 mb-4 bg-emerald-900 border border-emerald-800 text-white p-4 rounded-xl shadow-lg w-fit max-w-[85%] sm:max-w-md z-20 shadow-emerald-900/20 transition-all">
              <div className="flex items-center gap-3 mb-2">
                 <div className="flex gap-1 items-end h-4">
                   <div className="w-1 bg-emerald-400 rounded-full animate-bounce" style={{ height: '100%', animationDelay: '0ms' }}></div>
                   <div className="w-1 bg-emerald-400 rounded-full animate-bounce" style={{ height: '75%', animationDelay: '150ms' }}></div>
                   <div className="w-1 bg-emerald-400 rounded-full animate-bounce" style={{ height: '100%', animationDelay: '300ms' }}></div>
                 </div>
                 <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">{t.listening}</span>
              </div>
              <p className="text-sm font-medium text-emerald-50 italic max-h-[100px] overflow-y-auto">
                {interimResult || "Speak now..."}
              </p>
            </div>
          )}

          <button
            onClick={toggleListening}
            className={`p-3.5 rounded-lg shrink-0 transition-colors border ${
              isListening ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
            }`}
             title="Voice Input (English/Telugu)"
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <div className="flex-1 relative flex gap-2">
            <select
              value={speechLang}
              onChange={(e) => setSpeechLang(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 sm:px-4 py-3.5 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-slate-700 font-medium cursor-pointer shrink-0"
              title="Voice Recognition Language"
              disabled={isListening}
            >
              <option value="en-IN">En</option>
              <option value="hi-IN">Hi</option>
              <option value="te-IN">Te</option>
              <option value="ta-IN">Ta</option>
              <option value="kn-IN">Kn</option>
              <option value="ml-IN">Ml</option>
            </select>
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setAutoSpeakResponse(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t.inputPlaceholder}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-3.5 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-slate-700 placeholder-slate-400 font-medium transition-shadow"
              disabled={isTyping}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="bg-emerald-600 hover:bg-emerald-500 text-white p-3.5 rounded-lg shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold shadow-sm flex items-center justify-center"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </footer>

      {/* Preventive Care & Tips Area */}
      {activeTab === 'tips' && <HealthTipsSection speechLang={speechLang} />}

      {/* Reminders Area */}
      {activeTab === 'reminders' && <RemindersSection speechLang={speechLang} />}

      {/* Active Alarms Modal (Prominent Alert) */}
      {activeAlarms.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl border-4 border-red-500 animate-in zoom-in-95 duration-300">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center animate-bounce shadow-inner">
                <Bell className="w-10 h-10 text-red-600 animate-pulse" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-center text-slate-900 uppercase tracking-tight mb-2">
              Time for Medication!
            </h2>
            <h3 className="text-center font-bold text-red-600 mb-6 text-sm tracking-wide">
              {t.medTime}
            </h3>
            
            <div className="space-y-3 mb-8 max-h-[40vh] overflow-y-auto pr-2">
              {activeAlarms.map(alarm => (
                <div key={alarm.id} className="bg-red-50 border-2 border-red-200 p-5 rounded-2xl text-center shadow-sm">
                  <p className="font-extrabold text-xl text-slate-800">{alarm.name}</p>
                  <p className="text-xs font-bold text-red-700 tracking-wider uppercase mt-2">Dosage: {alarm.dosage}</p>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => {
                setActiveAlarms([]);
                stopUrgentAlarm();
              }}
              className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-4 rounded-xl text-lg tracking-wider shadow-lg transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-6 h-6" /> {t.tookIt}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssessmentCard({ data }: { data: AssessmentData }) {
  if (!data || !data.localContent) return null;

  const isHighUrgency = data.urgencyLevel === 'HIGH';
  const isMediumUrgency = data.urgencyLevel === 'MEDIUM';

  const formatText = (text: string | undefined) => {
    if (!text || text.trim() === 'Not applicable' || text.trim() === 'None' || text.trim() === 'NA') {
      return null;
    }
    return text.trim();
  };

  const detectedLanguage = data.detectedLanguage || 'English';
  const showEnglish = data.englishContent && detectedLanguage !== 'English';

  const localIssue = formatText(data.localContent?.possibleIssue);
  const englishIssue = showEnglish ? formatText(data.englishContent?.possibleIssue) : null;
  const displayIssue = localIssue || englishIssue;

  return (
    <div className="w-full bg-white rounded-xl rounded-tl-sm shadow-sm border border-slate-200 flex flex-col overflow-hidden">
      {/* Triage Header */}
      <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between border-b gap-3 ${
        isHighUrgency ? 'bg-red-50 border-red-100' :
        isMediumUrgency ? 'bg-yellow-50 border-yellow-100' : 'bg-emerald-50 border-emerald-100'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full border tracking-wider uppercase shrink-0 ${
            isHighUrgency ? 'bg-red-100 text-red-800 border-red-200' :
            isMediumUrgency ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
          }`}>
            URGENCY: {data.urgencyLevel}
          </span>
          <h3 className="font-bold text-slate-800 text-sm">
             {displayIssue ? `Condition: ${displayIssue}` : "General Information"}
             {detectedLanguage !== 'English' && <span className="text-xs text-slate-500 font-normal ml-2 tracking-wide font-sans bg-white/50 px-2 py-0.5 rounded-full border">{detectedLanguage}</span>}
          </h3>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto">
        {/* Left Column (Local Language) */}
        <div className="flex flex-col space-y-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2">Response ({detectedLanguage})</h4>
          
          {formatText(data.localContent.advice) && (
            <div>
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Advice / సలహా / सलाह</h5>
              <p className="text-sm text-slate-700 space-y-2 whitespace-pre-wrap leading-relaxed">{formatText(data.localContent.advice)}</p>
            </div>
          )}
          {formatText(data.localContent.nutritionPlan) && (
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden">
              <div className="absolute -right-2 -top-2 opacity-10">
                <Apple className="w-16 h-16 text-emerald-600" />
              </div>
              <h5 className="flex items-center gap-2 text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-2">
                <Apple className="w-4 h-4" /> Nutrition Planner
              </h5>
              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap relative z-10">{formatText(data.localContent.nutritionPlan)}</div>
            </div>
          )}
          {formatText(data.localContent.lifestyle) && (
            <div className="bg-sky-50 p-4 rounded-xl border border-sky-100 shadow-sm relative overflow-hidden">
              <div className="absolute -right-2 -top-2 opacity-10">
                <Activity className="w-16 h-16 text-sky-600" />
              </div>
              <h5 className="flex items-center gap-2 text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-2">
                <Activity className="w-4 h-4" /> Lifestyle Guide
              </h5>
              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap relative z-10">{formatText(data.localContent.lifestyle)}</div>
            </div>
          )}
          {formatText(data.localContent.whenToSeeDoctor) && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <h5 className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">Doctor Visit</h5>
              <p className="text-sm font-medium text-red-700 leading-relaxed whitespace-pre-wrap">{formatText(data.localContent.whenToSeeDoctor)}</p>
            </div>
          )}
        </div>

        {/* Right Column (English Translation) */}
        {showEnglish && data.englishContent ? (
          <div className="flex flex-col space-y-6 border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-8">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2">English Translation</h4>
            
            {formatText(data.englishContent.advice) && (
              <div>
                <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Advice</h5>
                <p className="text-sm text-slate-700 space-y-2 whitespace-pre-wrap leading-relaxed">{formatText(data.englishContent.advice)}</p>
              </div>
            )}
            {formatText(data.englishContent.nutritionPlan) && (
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden">
                <div className="absolute -right-2 -top-2 opacity-10">
                  <Apple className="w-16 h-16 text-emerald-600" />
                </div>
                <h5 className="flex items-center gap-2 text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-2">
                  <Apple className="w-4 h-4" /> Nutrition Planner
                </h5>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap relative z-10">{formatText(data.englishContent.nutritionPlan)}</div>
              </div>
            )}
            {formatText(data.englishContent.lifestyle) && (
              <div className="bg-sky-50 p-4 rounded-xl border border-sky-100 shadow-sm relative overflow-hidden">
                <div className="absolute -right-2 -top-2 opacity-10">
                  <Activity className="w-16 h-16 text-sky-600" />
                </div>
                <h5 className="flex items-center gap-2 text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-2">
                  <Activity className="w-4 h-4" /> Lifestyle Guide
                </h5>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap relative z-10">{formatText(data.englishContent.lifestyle)}</div>
              </div>
            )}
            {formatText(data.englishContent.whenToSeeDoctor) && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <h5 className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">Doctor Visit</h5>
                <p className="text-sm font-medium text-red-700 leading-relaxed whitespace-pre-wrap">{formatText(data.englishContent.whenToSeeDoctor)}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center text-slate-300 space-y-3 opacity-50 border-l border-slate-100 pl-8">
            <MessageSquare className="w-12 h-12" />
            <p className="text-sm font-medium">English context provided implicitly.</p>
          </div>
        )}
      </div>

      {/* Footer Disclaimer */}
      {data.disclaimer && (
        <div className="m-6 mt-0 bg-slate-200/50 p-4 rounded-lg border border-slate-200 flex items-start sm:items-center gap-4">
          <AlertCircle className="w-6 h-6 text-slate-500 shrink-0" />
          <p className="text-[11px] text-slate-500 leading-tight uppercase font-semibold tracking-wide">
            Disclaimer: {data.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}

function HealthTipsSection({ speechLang }: { speechLang: string }) {
  const tipsByLang: Record<string, any[]> = {
    'en-IN': [
      { id: 1, icon: <Droplets className="w-6 h-6 text-blue-500" />, title: "Clean Water & Hydration", localTitle: "Clean Water", desc: "Always boil and cool water before drinking to prevent waterborne diseases like Typhoid and Cholera. Drink at least 8 glasses of water daily.", localDesc: "Drink at least 8 glasses of water daily." },
      { id: 2, icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />, title: "Hand Hygiene", localTitle: "Hand Hygiene", desc: "Wash your hands thoroughly with soap and water before meals and after using the toilet to prevent infections.", localDesc: "Wash your hands thoroughly." },
      { id: 3, icon: <Bug className="w-6 h-6 text-amber-500" />, title: "Prevent Mosquito Bites", localTitle: "Prevent Mosquitoes", desc: "Keep your surroundings clean and dry. Use mosquito nets while sleeping to protect against Dengue and Malaria.", localDesc: "Use mosquito nets while sleeping." },
      { id: 4, icon: <Apple className="w-6 h-6 text-red-500" />, title: "Balanced Diet", localTitle: "Balanced Diet", desc: "Include seasonal fruits, local green leafy vegetables, and lentils in your daily meals to build strong immunity.", localDesc: "Eat seasonal fruits." },
      { id: 5, icon: <Baby className="w-6 h-6 text-purple-500" />, title: "Maternal Health", localTitle: "Maternal Health", desc: "Pregnant women must attend regular check-ups at the local Primary Health Centre (PHC) and take iron/calcium supplements.", localDesc: "Take supplements and attend check-ups." }
    ],
    'te-IN': [
      { id: 1, icon: <Droplets className="w-6 h-6 text-blue-500" />, title: "Clean Water & Hydration", localTitle: "పరిశుభ్రమైన నీరు", desc: "Always boil and cool water before drinking...", localDesc: "టైఫాయిడ్ మరియు కలరా వంటి నీటి ద్వారా వ్యాపించే వ్యాధులను నివారించడానికి త్రాగే ముందు ఎల్లప్పుడూ నీటిని మరిగించి చల్లార్చండి. రోజుకు కనీసం 8 గ్లాసుల నీరు త్రాగాలి." },
      { id: 2, icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />, title: "Hand Hygiene", localTitle: "చేతుల పరిశుభ్రత", desc: "Wash your hands thoroughly with soap and water...", localDesc: "సంక్రమణలను నివారించడానికి భోజనానికి ముందు మరియు టాయిలెట్ ఉపయోగించిన తర్వాత సబ్బు మరియు నీటితో మీ చేతులను బాగా కడగాలి." },
      { id: 3, icon: <Bug className="w-6 h-6 text-amber-500" />, title: "Prevent Mosquito Bites", localTitle: "దోమల నివారణ", desc: "Keep your surroundings clean and dry...", localDesc: "మీ పరిసరాలను శుభ్రంగా మరియు పొడిగా ఉంచండి. డెంగ్యూ మరియు మలేరియా నుండి రక్షించడానికి నిద్రపోతున్నప్పుడు దోమల వలలను (మస్కిటో నెట్స్) ఉపయోగించండి." },
      { id: 4, icon: <Apple className="w-6 h-6 text-red-500" />, title: "Balanced Diet", localTitle: "పౌష్టికాహారం", desc: "Include seasonal fruits, local green leafy vegetables...", localDesc: "బలమైన రోగనిరోధక శక్తిని పెంపొందించడానికి మీ రోజువారీ భోజనంలో కాలానుగుణ పండ్లు, ఆకుపచ్చని కూరగాయలు మరియు పప్పులను చేర్చండి." },
      { id: 5, icon: <Baby className="w-6 h-6 text-purple-500" />, title: "Maternal Health", localTitle: "గర్భిణీల జాగ్రత్తలు", desc: "Pregnant women must attend regular check-ups...", localDesc: "గర్భిణీ స్త్రీలు స్థానిక ప్రాథమిక ఆరోగ్య కేంద్రంలో (PHC) క్రమం తప్పకుండా తనిఖీలకు హాజరు కావాలి మరియు ఐరన్/కాల్షియం మాత్రలు తీసుకోవాలి." }
    ],
    'hi-IN': [
      { id: 1, icon: <Droplets className="w-6 h-6 text-blue-500" />, title: "Clean Water & Hydration", localTitle: "साफ पानी", desc: "Always boil and cool water before drinking...", localDesc: "पानी से होने वाली बीमारियों से बचने के लिए हमेशा पानी उबालकर और ठंडा करके पिएं। रोजाना कम से कम 8 गिलास पानी पिएं।" },
      { id: 2, icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />, title: "Hand Hygiene", localTitle: "हाथों की स्वच्छता", desc: "Wash your hands thoroughly with soap and water...", localDesc: "संक्रमण से बचने के लिए खाना खाने से पहले और शौचालय के इस्तेमाल के बाद अपने हाथों को साबुन और पानी से अच्छी तरह धो लें।" },
      { id: 3, icon: <Bug className="w-6 h-6 text-amber-500" />, title: "Prevent Mosquito Bites", localTitle: "मच्छरों से बचाव", desc: "Keep your surroundings clean and dry...", localDesc: "अपने आस-पास साफ और सूखा रखें। डेंगू और मलेरिया से बचने के लिए सोते समय मच्छरदानी का प्रयोग करें।" },
      { id: 4, icon: <Apple className="w-6 h-6 text-red-500" />, title: "Balanced Diet", localTitle: "संतुलित आहार", desc: "Include seasonal fruits, local green leafy vegetables...", localDesc: "मजबूत रोग प्रतिरोधक क्षमता बनाने के लिए अपने दैनिक भोजन में मौसमी फल, हरी सब्जियां और दालें शामिल करें।" },
      { id: 5, icon: <Baby className="w-6 h-6 text-purple-500" />, title: "Maternal Health", localTitle: "मातृ स्वास्थ्य", desc: "Pregnant women must attend regular check-ups...", localDesc: "गर्भवती महिलाओं को नियमित रूप से जांच के लिए स्थानीय प्राथमिक स्वास्थ्य केंद्र (पीएचसी) जाना चाहिए और आयरन/कैल्शियम की गोलियां लेनी चाहिए।" }
    ],
    'ta-IN': [
      { id: 1, icon: <Droplets className="w-6 h-6 text-blue-500" />, title: "Clean Water & Hydration", localTitle: "சுத்தமான நீர்", desc: "Always boil and cool water before drinking...", localDesc: "காய்ச்சல் மற்றும் காலரா போன்ற நோய்களைத் தடுக்க எப்பொழுதும் தண்ணீரை கொதிக்க வைத்து குடிக்கவும். தினமும் குறைந்தபட்சம் 8 கிளாஸ் தண்ணீர் குடிக்கவும்." },
      { id: 2, icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />, title: "Hand Hygiene", localTitle: "கை சுகாதாரம்", desc: "Wash your hands thoroughly with soap and water...", localDesc: "உணவுக்கு முன் மற்றும் கழிப்பறை பயன்படுத்திய பின் சோப்பு மற்றும் தண்ணீரால் கைகளை நன்கு கழுவவும்." },
      { id: 3, icon: <Bug className="w-6 h-6 text-amber-500" />, title: "Prevent Mosquito Bites", localTitle: "கொசு கடி தடுத்தல்", desc: "Keep your surroundings clean and dry...", localDesc: "உங்கள் சுற்றுப்புறங்களை சுத்தமாகவும் உலர்வாகவும் வைத்திருக்கவும். டெங்கு மற்றும் மலேரியாவை தடுக்க கொசு வலைகளைப் பயன்படுத்தவும்." },
      { id: 4, icon: <Apple className="w-6 h-6 text-red-500" />, title: "Balanced Diet", localTitle: "சமச்சீர் உணவு", desc: "Include seasonal fruits, local green leafy vegetables...", localDesc: "காய்கறிகள், பருப்புகள் மற்றும் பழங்களை அதிகம் சேர்த்துக் கொள்ளவும்." },
      { id: 5, icon: <Baby className="w-6 h-6 text-purple-500" />, title: "Maternal Health", localTitle: "தாய்மை நலன்", desc: "Pregnant women must attend regular check-ups...", localDesc: "கர்ப்பிணி பெண்கள் மருத்துமனைக்கு சென்று முறையான பரிசோதனைகளை மேற்கொள்ள வேண்டும்." }
    ],
    'kn-IN': [
      { id: 1, icon: <Droplets className="w-6 h-6 text-blue-500" />, title: "Clean Water & Hydration", localTitle: "ಶುದ್ಧ ನೀರು", desc: "Always boil and cool water before drinking...", localDesc: "ನೀರಿನಿಂದ ಹರಡುವ ರೋಗಗಳನ್ನು ತಡೆಗಟ್ಟಲು ಕುಡಿಯುವ ಮೊದಲು ನೀರನ್ನು ಯಾವಾಗಲೂ ಕುದಿಸಿ ಮತ್ತು ತಂಪಾಗಿಸಿ. ದಿನಕ್ಕೆ ಕನಿಷ್ಠ 8 ಗ್ಲಾಸ್ ನೀರು ಕುಡಿಯಿರಿ." },
      { id: 2, icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />, title: "Hand Hygiene", localTitle: "ಕೈ ಶುಚಿತ್ವ", desc: "Wash your hands thoroughly with soap and water...", localDesc: "ಸೋಂಕುಗಳನ್ನು ತಡೆಗಟ್ಟಲು ಊಟಕ್ಕೆ ಮೊದಲು ಮತ್ತು ಶೌಚಾಲಯವನ್ನು ಬಳಸಿದ ನಂತರ ನಿಮ್ಮ ಕೈಗಳನ್ನು ಸಾಬೂನು ಮತ್ತು ನೀರಿನಿಂದ ಚೆನ್ನಾಗಿ ತೊಳೆಯಿರಿ." },
      { id: 3, icon: <Bug className="w-6 h-6 text-amber-500" />, title: "Prevent Mosquito Bites", localTitle: "ಸೊಳ್ಳೆ ಕಡಿತ ತಡೆಗಟ್ಟಿ", desc: "Keep your surroundings clean and dry...", localDesc: "ನಿಮ್ಮ ಸುತ್ತಮುತ್ತಲಿನ ಪ್ರದೇಶವನ್ನು ಸ್ವಚ್ಛವಾಗಿ ಮತ್ತು ಒಣಗಿಸಿಡಿ. ಡೆಂಗ್ಯೂ ಮತ್ತು ಮಲೇರಿಯಾವನ್ನು ತಡೆಗಟ್ಟಲು ಮಲಗುವಾಗ ಸೊಳ್ಳೆ ಪರದೆಗಳನ್ನು ಬಳಸಿ." },
      { id: 4, icon: <Apple className="w-6 h-6 text-red-500" />, title: "Balanced Diet", localTitle: "ಸಮತೋಲಿತ ಆಹಾರ", desc: "Include seasonal fruits, local green leafy vegetables...", localDesc: "ಬಲವಾದ ರೋಗನಿರೋಧಕ ಶಕ್ತಿಯನ್ನು ನಿರ್ಮಿಸಲು ನಿಮ್ಮ ದೈನಂದಿನ ಊಟದಲ್ಲಿ ಕಾಲೋಚಿತ ಹಣ್ಣುಗಳು, ಹಸಿರು ಎಲೆಗಳ ತರಕಾರಿಗಳು ಮತ್ತು ಬೇಳೆಕಾಳುಗಳನ್ನು ಸೇರಿಸಿ." },
      { id: 5, icon: <Baby className="w-6 h-6 text-purple-500" />, title: "Maternal Health", localTitle: "ತಾಯಿಯ ಆರೋಗ್ಯ", desc: "Pregnant women must attend regular check-ups...", localDesc: "ಗರ್ಭಿಣಿಯರು ಸ್ಥಳೀಯ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರದಲ್ಲಿ (PHC) ನಿಯಮಿತ ತಪಾಸಣೆಗೆ ಹಾಜರಾಗಬೇಕು ಮತ್ತು ಕಬ್ಬಿಣ/ಕ್ಯಾಲ್ಸಿಯಂ ಮಾತ್ರೆಗಳನ್ನು ತೆಗೆದುಕೊಳ್ಳಬೇಕು." }
    ],
    'ml-IN': [
      { id: 1, icon: <Droplets className="w-6 h-6 text-blue-500" />, title: "Clean Water & Hydration", localTitle: "ശുദ്ധജലം", desc: "Always boil and cool water before drinking...", localDesc: "ജലജന്യ രോഗങ്ങൾ തടയാൻ എപ്പോഴും തിളപ്പിച്ചാറ്റിയ വെള്ളം കുടിക്കുക. ദിവസവും കുറഞ്ഞത് 8 ഗ്ലാസ് വെള്ളം കുടിക്കുക." },
      { id: 2, icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />, title: "Hand Hygiene", localTitle: "കൈകളുടെ ശുചിത്വം", desc: "Wash your hands thoroughly with soap and water...", localDesc: "ഭക്ഷണത്തിന് മുൻപും ശൗചാലയം ഉപയോഗിച്ചതിന് ശേഷവും സോപ്പും വെള്ളവും ഉപയോഗിച്ച് കൈകൾ നന്നായി കഴുകുക." },
      { id: 3, icon: <Bug className="w-6 h-6 text-amber-500" />, title: "Prevent Mosquito Bites", localTitle: "കൊതുക് കടി തടയുക", desc: "Keep your surroundings clean and dry...", localDesc: "ചുറ്റുപാടുകൾ വൃത്തിയായും വരണ്ടുമാറ്റി സൂക്ഷിക്കുക. ഡെങ്കിപ്പനി, മലേറിയ എന്നിവ തടയാൻ ഉറങ്ങുമ്പോൾ കൊതുകുവല ഉപയോഗിക്കുക." },
      { id: 4, icon: <Apple className="w-6 h-6 text-red-500" />, title: "Balanced Diet", localTitle: "സമീകൃതാഹാരം", desc: "Include seasonal fruits, local green leafy vegetables...", localDesc: "രോഗപ്രതിരോധശേഷി വർദ്ധിപ്പിക്കുന്നതിനായി നിങ്ങളുടെ ദൈനംദിന ഭക്ഷണത്തിൽ സീസണൽ പഴങ്ങൾ, പച്ചക്കറികൾ, പയർവർഗ്ഗങ്ങൾ എന്നിവ ഉൾപ്പെടുത്തുക." },
      { id: 5, icon: <Baby className="w-6 h-6 text-purple-500" />, title: "Maternal Health", localTitle: "മാതൃ ആരോഗ്യം", desc: "Pregnant women must attend regular check-ups...", localDesc: "ഗർഭിണികൾ പ്രാഥമിക ആരോഗ്യ കേന്ദ്രത്തിൽ (PHC) പതിവായി പരിശോധന നടത്തുകയും ഇരുമ്പ്/കാൽസ്യം ഗുളികകൾ കഴിക്കുകയും ചെയ്യണം." }
    ]
  };

  const currentTips = tipsByLang[speechLang] || tipsByLang['te-IN'];

  const glossaryTerms = [
    { eng: "Fever", translations: [{ lang: "te-IN", label: "Telugu", term: "జ్వరం" }, { lang: "hi-IN", label: "Hindi", term: "बुखार" }, { lang: "ta-IN", label: "Tamil", term: "காய்ச்சல்" }, { lang: "kn-IN", label: "Kannada", term: "ಜ್ವರ" }, { lang: "ml-IN", label: "Malayalam", term: "പനി" }] },
    { eng: "Blood Pressure", translations: [{ lang: "te-IN", label: "Telugu", term: "రక్తపోటు" }, { lang: "hi-IN", label: "Hindi", term: "रक्तचाप" }, { lang: "ta-IN", label: "Tamil", term: "இரத்த அழுத்தம்" }, { lang: "kn-IN", label: "Kannada", term: "ರಕ್ತದೊತ್ತಡ" }, { lang: "ml-IN", label: "Malayalam", term: "രക്തസമ്മർദ്ദം" }] },
    { eng: "Medicine / Pill", translations: [{ lang: "te-IN", label: "Telugu", term: "మందు" }, { lang: "hi-IN", label: "Hindi", term: "दवा" }, { lang: "ta-IN", label: "Tamil", term: "மருந்து" }, { lang: "kn-IN", label: "Kannada", term: "ಔಷಧಿ" }, { lang: "ml-IN", label: "Malayalam", term: "മരുന്ന്" }] },
    { eng: "Heart Attack", translations: [{ lang: "te-IN", label: "Telugu", term: "గుండెపోటు" }, { lang: "hi-IN", label: "Hindi", term: "दिल का दौरा" }, { lang: "ta-IN", label: "Tamil", term: "மாரடைப்பு" }, { lang: "kn-IN", label: "Kannada", term: "ಹೃದಯಾಘಾತ" }, { lang: "ml-IN", label: "Malayalam", term: "ഹൃദയാഘാതം" }] },
    { eng: "Diabetes", translations: [{ lang: "te-IN", label: "Telugu", term: "మధుమేహం" }, { lang: "hi-IN", label: "Hindi", term: "मधुमेह" }, { lang: "ta-IN", label: "Tamil", term: "நீரிழிவு" }, { lang: "kn-IN", label: "Kannada", term: "ಮಧುಮೇಹ" }, { lang: "ml-IN", label: "Malayalam", term: "പ്രമേഹം" }] }
  ];

  const playPronunciation = (text: string, lang: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in your browser.");
    }
  };

  return (
    <main className="flex-grow overflow-y-auto w-full p-6 bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-8 pb-8">
        <div className="bg-emerald-800 text-white rounded-2xl p-8 shadow-sm flex flex-col md:flex-row items-center gap-6 justify-between border border-emerald-900/50">
          <div className="space-y-3 max-w-2xl text-center md:text-left">
            <h2 className="text-2xl font-bold tracking-tight">Preventive Care & Wellness</h2>
            <p className="text-emerald-100/90 text-sm leading-relaxed">
              Good health starts with prevention. Follow these daily practices to protect your family from common illnesses and maintain a strong immune system. Available 100% offline.
            </p>
          </div>
          <HeartPulse className="w-20 h-20 text-emerald-600 opacity-50 shrink-0 hidden md:block" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentTips.map(tip => (
            <div key={tip.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 shrink-0 shadow-inner">
                  {tip.icon}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 leading-tight">{tip.title}</h3>
                  <h4 className="text-sm font-semibold text-emerald-600 font-telugu mt-1 tracking-wide">{tip.localTitle}</h4>
                </div>
              </div>
              <div className="space-y-4 mt-2 border-t border-slate-100 pt-4 flex-grow">
                <p className="text-sm text-slate-600 leading-relaxed text-justify">{tip.desc}</p>
                <p className="text-sm text-slate-700 leading-relaxed font-telugu text-justify bg-slate-50 p-3 rounded-lg border border-slate-100">{tip.localDesc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pronunciation & Glossary Guide */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-800">Medical Pronunciation Guide</h3>
              <p className="text-sm text-slate-500">Listen to common health terms translated into multiple languages.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {glossaryTerms.map((item, index) => (
              <div key={index} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">{item.eng}</h4>
                <div className="space-y-3">
                  {item.translations.map((trans, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">{trans.label}</span>
                        <span className="text-base font-semibold text-slate-700">{trans.term}</span>
                      </div>
                      <button
                        onClick={() => playPronunciation(trans.term, trans.lang)}
                        className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-colors"
                        title={`Listen in ${trans.label}`}
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}

function RemindersSection({ speechLang }: { speechLang: string }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isDBReady, setIsDBReady] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDosage, setNewDosage] = useState('');
  const [newTime, setNewTime] = useState('');

  useEffect(() => {
    async function loadReminders() {
      try {
        const saved = await get<Reminder[]>('rural_health_reminders');
        if (saved) {
          setReminders(saved);
        }
      } catch (err) {
        console.error("IDB load reminders error", err);
      } finally {
        setIsDBReady(true);
      }
    }
    loadReminders();
  }, []);

  useEffect(() => {
    if (isDBReady) {
      set('rural_health_reminders', reminders).catch(console.error);
    }
  }, [reminders, isDBReady]);

  const handleAdd = () => {
    if (!newName.trim() || !newTime.trim()) return;
    
    const newReminder: Reminder = {
      id: Date.now().toString(),
      name: newName.trim(),
      dosage: newDosage.trim() || '1 pill',
      time: newTime,
      active: true,
    };

    setReminders([...reminders, newReminder]);
    setNewName('');
    setNewDosage('');
    setNewTime('');
    setIsAdding(false);
    
    // Request permission if not granted
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  };

  const deleteReminder = (id: string) => {
    setReminders(reminders.filter(r => r.id !== id));
  };

  const toggleReminder = (id: string) => {
    setReminders(reminders.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const t = uiTranslations[speechLang] || uiTranslations['en-IN'];

  return (
    <main className="flex-grow overflow-y-auto w-full p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto space-y-8 pb-8">
        
        {/* Header Banner */}
        <div className="bg-emerald-800 text-white rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-center gap-6 justify-between border border-emerald-900/50">
          <div className="space-y-3 max-w-2xl text-center md:text-left">
            <h2 className="text-2xl font-bold tracking-tight flex items-center justify-center md:justify-start gap-2">
              <Bell className="w-6 h-6" /> {t.reminder}
            </h2>
            <p className="text-emerald-100/90 text-sm leading-relaxed">
              {t.addReminderDesc}
            </p>
          </div>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="shrink-0 bg-white text-emerald-800 hover:bg-emerald-50 px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            {isAdding ? 'Cancel' : <><Plus className="w-5 h-5" /> Add Reminder</>}
          </button>
        </div>

        {/* Add Form */}
        {isAdding && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="font-bold text-slate-800 mb-4 text-lg">New Prescription details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Medication Name</label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Paracetamol"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-700 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Dosage (Optional)</label>
                <input 
                  type="text" 
                  value={newDosage}
                  onChange={(e) => setNewDosage(e.target.value)}
                  placeholder="e.g. 500mg or 2 pills"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-700 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Time to take</label>
                <input 
                  type="time" 
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-700 font-medium cursor-pointer"
                />
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button 
                onClick={handleAdd}
                disabled={!newName.trim() || !newTime.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-8 py-2.5 rounded-lg font-bold shadow-sm transition-colors"
              >
                Save Schedule
              </button>
            </div>
          </div>
        )}

        {/* Reminders List */}
        {reminders.length === 0 ? (
          <div className="text-center p-12 bg-white border border-slate-200 rounded-xl border-dashed">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No medication reminders set yet.</p>
            <p className="text-sm text-slate-400 mt-1">Click "Add Reminder" to keep track of your doses.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reminders.map(reminder => (
              <div key={reminder.id} className={`bg-white border rounded-xl p-5 shadow-sm flex items-center justify-between transition-opacity ${!reminder.active ? 'opacity-60 border-slate-200' : 'border-emerald-200 bg-emerald-50/30'}`}>
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 border border-slate-200">
                     <Clock className={`w-6 h-6 ${reminder.active ? 'text-emerald-500' : 'text-slate-400'}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{reminder.name}</h3>
                    <p className="text-xs font-bold text-slate-500 tracking-wider">
                      {reminder.active ? <span className="text-emerald-600">ACTIVE {reminder.time}</span> : `INACTIVE ${reminder.time}`} • {reminder.dosage}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => toggleReminder(reminder.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${
                      reminder.active ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' : 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                    }`}
                  >
                    {reminder.active ? 'Pause' : 'Resume'}
                  </button>
                  <button 
                    onClick={() => deleteReminder(reminder.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                    title="Delete Reminder"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
