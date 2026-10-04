import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with high limit for audio uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// API Routes

// 1. Transcribe Audio & Generate Word-by-Word Timestamps
app.post('/api/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/mp3', providedText, title = 'Uploaded Audiobook' } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
    }

    if (!audioBase64 && !providedText) {
      return res.status(400).json({ error: 'Either audioBase64 or providedText must be supplied.' });
    }

    const prompt = `You are an expert audio-transcription and language alignment system.
${audioBase64 ? 'Transcribe the provided audio into English.' : `Align the following English text: "${providedText}"`}
${providedText ? `Reference text provided: "${providedText}". Use this text if accurate.` : ''}

You MUST return a JSON object with this EXACT structure:
{
  "title": "${title}",
  "summaryPt": "Breve resumo em português do conteúdo",
  "level": "Beginner" | "Intermediate" | "Advanced",
  "totalDurationEstimate": number (in seconds),
  "sentences": [
    {
      "id": "s1",
      "index": 0,
      "start": 0.0,
      "end": 4.5,
      "text": "Full English sentence here.",
      "translationPt": "Tradução natural da frase em português.",
      "words": [
        {
          "word": "Full",
          "cleanWord": "full",
          "start": 0.0,
          "end": 0.5,
          "index": 0
        },
        {
          "word": "English",
          "cleanWord": "english",
          "start": 0.6,
          "end": 1.2,
          "index": 1
        }
      ]
    }
  ]
}

Ensure all timestamps are realistic, sequential, and cover every word accurately. Punctuation should remain attached to 'word' (e.g. 'world,') but 'cleanWord' should be lowercase without punctuation (e.g. 'world').`;

    let response;
    if (audioBase64) {
      // Audio transcription with gemini-3.8-flash for structured JSON with word cues & translations
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64,
            },
          },
          {
            text: prompt,
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });
    } else {
      // Text alignment
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
    }

    let text = (response.text || '{}').trim();
    // Clean any markdown code blocks
    text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      console.warn('JSON.parse failed on transcription response, building fallback:', text.slice(0, 100));
      const cleanText = text.replace(/[{}[\]"]/g, '').trim();
      const rawSentences = cleanText.split(/(?<=[.?!])\s+/).filter(Boolean);
      parsed = {
        title,
        summaryPt: 'Áudio importado e transcrito com IA.',
        level: 'Intermediate',
        totalDurationEstimate: rawSentences.length * 6,
        sentences: rawSentences.map((s, idx) => ({
          id: `s-${idx}`,
          index: idx,
          start: +(idx * 5).toFixed(2),
          end: +((idx + 1) * 5).toFixed(2),
          text: s.trim(),
          translationPt: 'Tradução do áudio',
          words: s.trim().split(/\s+/).map((w, wIdx) => ({
            word: w,
            cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
            start: +(idx * 5 + wIdx * 0.4).toFixed(2),
            end: +(idx * 5 + (wIdx + 1) * 0.4).toFixed(2),
            index: wIdx,
          })),
        })),
      };
    }

    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/transcribe-audio:', error);
    return res.status(500).json({ error: error.message || 'Failed to transcribe/align audio' });
  }
});

// Fast Just-In-Time (JIT) chunk transcription as playback advances
app.post('/api/transcribe-chunk', async (req, res) => {
  try {
    const { audioChunkBase64, mimeType = 'audio/wav', startOffset = 0, duration = 20 } = req.body;

    if (!audioChunkBase64) {
      return res.status(400).json({ error: 'audioChunkBase64 required' });
    }

    // High-speed plain text speech transcription without JSON generation delay
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: audioChunkBase64,
          },
        },
        { text: 'Transcribe the spoken English in this audio clip. Output ONLY the plain spoken words, with proper capitalization and punctuation. If silence or music, reply empty.' },
      ],
    });

    const rawTranscript = (response.text || '').trim().replace(/^["']|["']$/g, '');

    if (!rawTranscript || rawTranscript.toLowerCase().includes('silence') || rawTranscript.length < 2) {
      return res.json({ sentences: [] });
    }

    // Fast translation using in-memory cache
    let ptTranslation = '';
    if (translationCache.has(rawTranscript)) {
      ptTranslation = translationCache.get(rawTranscript)!;
    } else {
      try {
        const trRes = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(rawTranscript.slice(0, 300))}&langpair=en|pt-BR`
        );
        if (trRes.ok) {
          const trData = await trRes.json();
          ptTranslation = trData?.responseData?.translatedText || '';
          if (ptTranslation) translationCache.set(rawTranscript, ptTranslation);
        }
      } catch {}
    }

    // Split into words with sequential timestamps
    const rawWords = rawTranscript.split(/\s+/).filter(Boolean);
    const wordDur = duration / Math.max(1, rawWords.length);

    const sentence = {
      id: `s-${Math.round(startOffset)}`,
      index: 0,
      start: +Number(startOffset).toFixed(2),
      end: +Number(startOffset + duration).toFixed(2),
      text: rawTranscript,
      translationPt: ptTranslation || 'Tradução do áudio',
      words: rawWords.map((w, wi) => ({
        word: w,
        cleanWord: w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase(),
        start: +(Number(startOffset) + wi * wordDur).toFixed(2),
        end: +(Number(startOffset) + (wi + 1) * wordDur).toFixed(2),
        index: wi,
      })),
    };

    return res.json({ sentences: [sentence] });
  } catch (err: any) {
    console.error('Chunk transcribe error:', err);
    return res.status(500).json({ error: err.message || 'Chunk failed' });
  }
});

// In-memory cache for instantaneous repeated lookups
const dictionaryCache = new Map<string, any>();
const translationCache = new Map<string, string>();

// Fast Traditional Dictionary Lookup without AI
async function lookupTraditionalDictionary(word: string, contextSentence: string = '') {
  const cleanWord = word.toLowerCase().replace(/[^a-z0-9']/g, '').trim();
  const cacheKey = `${cleanWord}_${contextSentence.slice(0, 30)}`;

  if (dictionaryCache.has(cacheKey)) {
    return dictionaryCache.get(cacheKey);
  }

  // Fetch Dictionary API, Translation API, and Datamuse concurrently in parallel (typically ~80-150ms)
  const [dictRes, transRes, synRes, antRes, colRes] = await Promise.allSettled([
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`),
    fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanWord)}&langpair=en|pt-BR`),
    fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(cleanWord)}&max=6`),
    fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(cleanWord)}&max=4`),
    fetch(`https://api.datamuse.com/words?rel_trg=${encodeURIComponent(cleanWord)}&max=6`),
  ]);

  let dictData: any = null;
  if (dictRes.status === 'fulfilled' && dictRes.value.ok) {
    try {
      const json: any = await dictRes.value.json();
      if (Array.isArray(json) && json.length > 0) {
        dictData = json[0];
      }
    } catch {}
  }

  let translationText = cleanWord;
  let matches: string[] = [];
  if (transRes.status === 'fulfilled' && transRes.value.ok) {
    try {
      const tJson: any = await transRes.value.json();
      if (tJson.responseData?.translatedText) {
        translationText = tJson.responseData.translatedText;
      }
      if (Array.isArray(tJson.matches)) {
        matches = tJson.matches.map((m: any) => m.translation).filter(Boolean).slice(0, 3);
      }
    } catch {}
  }

  let synonyms: string[] = [];
  if (synRes.status === 'fulfilled' && synRes.value.ok) {
    try {
      const sJson: any = await synRes.value.json();
      if (Array.isArray(sJson)) {
        synonyms = sJson.map((item: any) => item.word);
      }
    } catch {}
  }

  let antonyms: string[] = [];
  if (antRes.status === 'fulfilled' && antRes.value.ok) {
    try {
      const aJson: any = await antRes.value.json();
      if (Array.isArray(aJson)) {
        antonyms = aJson.map((item: any) => item.word);
      }
    } catch {}
  }

  let collocations: string[] = [];
  if (colRes.status === 'fulfilled' && colRes.value.ok) {
    try {
      const cJson: any = await colRes.value.json();
      if (Array.isArray(cJson)) {
        collocations = cJson.map((item: any) => `${cleanWord} ${item.word}`);
      }
    } catch {}
  }

  // Extract phonetic & real human audio URL if present
  let phonetic = '';
  let audioUrl = '';
  if (dictData?.phonetics) {
    for (const p of dictData.phonetics) {
      if (p.text && !phonetic) phonetic = p.text;
      if (p.audio && !audioUrl) audioUrl = p.audio;
    }
  }
  if (!phonetic && dictData?.phonetic) {
    phonetic = dictData.phonetic;
  }

  // Extract meanings & definitions
  const definitions: any[] = [];
  let partOfSpeech = 'termo';
  const examples: any[] = [];

  if (dictData?.meanings) {
    for (const m of dictData.meanings) {
      if (m.partOfSpeech && partOfSpeech === 'termo') partOfSpeech = m.partOfSpeech;
      if (m.definitions) {
        for (const d of m.definitions) {
          if (d.definition && definitions.length < 4) {
            definitions.push({
              pos: m.partOfSpeech || 'termo',
              englishDef: d.definition,
              portugueseDef: '',
            });
          }
          if (d.example && examples.length < 3) {
            examples.push({
              en: d.example,
              pt: '',
            });
          }
        }
      }
      if (m.synonyms && synonyms.length < 6) {
        synonyms.push(...m.synonyms);
      }
      if (m.antonyms && antonyms.length < 4) {
        antonyms.push(...m.antonyms);
      }
    }
  }

  // Deduplicate
  synonyms = Array.from(new Set(synonyms)).slice(0, 6);
  antonyms = Array.from(new Set(antonyms)).slice(0, 4);
  collocations = Array.from(new Set(collocations)).slice(0, 4);

  if (definitions.length === 0) {
    definitions.push({
      pos: partOfSpeech,
      englishDef: `Direct meaning: "${translationText}"`,
      portugueseDef: translationText,
    });
  }

  if (examples.length === 0 && contextSentence) {
    examples.push({
      en: contextSentence,
      pt: `Exemplo do contexto no audiolivro.`,
    });
  }

  // Determine estimated CEFR level mathematically by frequency / length
  let cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' = 'B1';
  if (cleanWord.length <= 4) cefrLevel = 'A1';
  else if (cleanWord.length <= 6) cefrLevel = 'A2';
  else if (cleanWord.length <= 8) cefrLevel = 'B1';
  else if (cleanWord.length <= 10) cefrLevel = 'B2';
  else cefrLevel = 'C1';

  const result = {
    word: cleanWord,
    phonetic: phonetic || `/${cleanWord}/`,
    audioUrl,
    partOfSpeech,
    cefrLevel,
    contextualTranslation: translationText,
    contextualExplanation:
      matches.length > 0
        ? `Outros significados comuns: ${matches.join(', ')}`
        : `Tradução direta e significado em português.`,
    definitions,
    synonyms,
    antonyms,
    collocations,
    examples,
    source: 'traditional_api',
  };

  dictionaryCache.set(cacheKey, result);
  return result;
}

// 2. Word Lookup: Ultra-fast traditional API with fallback to Gemini AI only if not found
app.post('/api/word-lookup', async (req, res) => {
  try {
    const { word, sentenceContext, surroundingParagraph, forceAI = false } = req.body;

    if (!word) {
      return res.status(400).json({ error: 'Word is required' });
    }

    // Step A: Use fast traditional dictionary unless forceAI is requested
    if (!forceAI) {
      try {
        const traditional = await lookupTraditionalDictionary(word, sentenceContext);
        if (traditional && traditional.definitions.length > 0 && traditional.contextualTranslation) {
          return res.json(traditional);
        }
      } catch (tradErr) {
        console.warn('Traditional dictionary API error, falling back to AI:', tradErr);
      }
    }

    // Step B: AI Fallback (only for words not found in traditional dictionaries)
    const prompt = `You are a master English lexicographer and bilingual language teacher for Portuguese speakers.
Analyze the word "${word}" in the following sentence context:
Context Sentence: "${sentenceContext || word}"
Surrounding Paragraph: "${surroundingParagraph || ''}"

Return a comprehensive JSON object with this exact structure:
{
  "word": "${word}",
  "phonetic": "/IPA phonetic transcription/",
  "partOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "phrasal verb" | "idiom",
  "cefrLevel": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  "contextualTranslation": "Tradução exata e natural desta palavra NESTE contexto específico",
  "contextualExplanation": "Explicação em português de por que significa isso aqui e nuances culturais/gramaticais",
  "definitions": [
    {
      "pos": "verb",
      "englishDef": "Clear English definition",
      "portugueseDef": "Definição clara em português"
    }
  ],
  "synonyms": ["synonym1", "synonym2", "synonym3", "synonym4"],
  "antonyms": ["antonym1", "antonym2"],
  "collocations": ["common collocation 1", "common collocation 2", "common collocation 3"],
  "examples": [
    {
      "en": "First natural example sentence using the word.",
      "pt": "Tradução do primeiro exemplo em português."
    }
  ],
  "grammarNotes": "Dicas gramaticais úteis."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    parsed.source = 'ai';
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/word-lookup:', error);
    return res.status(500).json({ error: error.message || 'Failed to lookup word' });
  }
});

// Fast Translation Route using MyMemory (no AI delay)
app.post('/api/fast-translate', async (req, res) => {
  try {
    const { text, from = 'en', to = 'pt-BR' } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });

    const cacheKey = `${from}_${to}_${text.trim()}`;
    if (translationCache.has(cacheKey)) {
      return res.json({ translatedText: translationCache.get(cacheKey) });
    }

    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    );
    const data: any = await response.json();
    const translated = data?.responseData?.translatedText || text;

    translationCache.set(cacheKey, translated);
    return res.json({ translatedText: translated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Translation failed' });
  }
});

// 3. Speaking Evaluation: Analyze pronunciation, clarity, intonation
app.post('/api/speaking-evaluate', async (req, res) => {
  try {
    const { targetSentence, transcribedSpeech, audioBase64, mimeType = 'audio/webm' } = req.body;

    if (!targetSentence) {
      return res.status(400).json({ error: 'targetSentence is required' });
    }

    const prompt = `You are a professional English pronunciation coach and phonetician for Portuguese native speakers.
Target sentence: "${targetSentence}"
User's transcribed utterance or speech: "${transcribedSpeech || 'Audio provided'}"

Evaluate the user's speech accuracy, pronunciation, rhythm, and intonation.
Provide word-by-word feedback: classify each word in the target sentence as 'good', 'average', or 'poor' with phonetic advice for sounds that Brazilian Portuguese speakers often struggle with (like 'th', dark 'l', final 'ed', vowel reductions, schwa, 'r' sound).

Return a JSON with:
{
  "overallScore": number (0 to 100),
  "fluencyScore": number (0 to 100),
  "accuracyScore": number (0 to 100),
  "recognizedText": "What was heard",
  "wordAnalysis": [
    {
      "word": "targetWord",
      "status": "good" | "average" | "poor",
      "tip": "Dica de pronúncia fonética se necessário (ex: 'Cuidado para não pronunciar como som de D, use a ponta da língua entre os dentes')"
    }
  ],
  "positiveFeedbackPt": "Elogio e pontos fortes da fala do usuário",
  "improvementTipsPt": "Dicas práticas de como melhorar a entonação e pronúncia",
  "phonemeFocus": ["/ð/", "/æ/", "/ɪ/"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/speaking-evaluate:', error);
    return res.status(500).json({ error: error.message || 'Failed to evaluate speaking' });
  }
});

// 4. Listening Quiz Generation
app.post('/api/listening-quiz', async (req, res) => {
  try {
    const { chapterText, level = 'Intermediate' } = req.body;

    if (!chapterText) {
      return res.status(400).json({ error: 'chapterText is required' });
    }

    const prompt = `You are an expert English listening comprehension instructor.
Based on the following audiobook excerpt:
"${chapterText.slice(0, 3000)}"

Generate a set of 4 engaging listening challenges:
1. One 'dictation' challenge (a key phrase with 1-3 missing words for the user to type).
2. Two 'comprehension' multiple-choice questions testing auditory comprehension of implied meaning, details, or emotions.
3. One 'vocabulary_in_context' challenge testing understanding of an idiom or phrasal verb heard in the audio.

Return JSON:
{
  "challenges": [
    {
      "id": "c1",
      "type": "dictation" | "comprehension" | "vocabulary_in_context",
      "targetSentence": "Sentence from the audio",
      "question": "Question or instructions in Portuguese",
      "maskedSentence": "Sentence with [____] for the missing word(s) if dictation",
      "correctAnswer": "Answer text or exact missing word",
      "options": ["Option A", "Option B", "Option C", "Option D"], // For multiple choice
      "explanationPt": "Explicação detalhada em português do porquê desta resposta",
      "audioTimeHint": "Dica de onde prestar atenção no áudio"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/listening-quiz:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate quiz' });
  }
});

// 5. Writing Evaluation & Paraphrasing Studio
app.post('/api/writing-evaluate', async (req, res) => {
  try {
    const { studentText, promptContext, targetLevel = 'B2' } = req.body;

    if (!studentText) {
      return res.status(400).json({ error: 'studentText is required' });
    }

    const prompt = `You are a master English writing tutor for ESL students.
Student's written submission:
"${studentText}"

Context/Topic of the chapter: "${promptContext || 'Audiobook discussion & summary'}"
Target proficiency level: "${targetLevel}"

Evaluate the text thoroughly.
Return JSON:
{
  "score": number (0 to 100),
  "estimatedCefrLevel": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  "summaryFeedbackPt": "Visão geral do texto em português, destacando clareza e estrutura",
  "strengthsPt": ["Ponto forte 1", "Ponto forte 2"],
  "corrections": [
    {
      "original": "error phrase",
      "corrected": "corrected phrase",
      "explanationPt": "Explicação clara da regra gramatical em português",
      "type": "grammar" | "spelling" | "punctuation" | "word_choice"
    }
  ],
  "vocabularyUpgrades": [
    {
      "original": "simple word/phrase (e.g. very good)",
      "suggested": "advanced natural phrase (e.g. outstanding / compelling)",
      "reasonPt": "Por que esta opção soa mais rica e natural no contexto"
    }
  ],
  "nativeVersion": "A polished, natural rewrite of the student's text at C1/C2 level preserving their core message"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/writing-evaluate:', error);
    return res.status(500).json({ error: error.message || 'Failed to evaluate writing' });
  }
});

// 6. Sentence Grammar Deep Dive
app.post('/api/explain-grammar', async (req, res) => {
  try {
    const { sentence } = req.body;
    if (!sentence) {
      return res.status(400).json({ error: 'sentence is required' });
    }

    const prompt = `You are a master English grammar teacher for Brazilian students.
Explain the grammar structures, verb tenses, prepositions, phrasal verbs, idioms, and clauses in this sentence:
"${sentence}"

Return JSON:
{
  "sentence": "${sentence}",
  "translationPt": "Tradução natural",
  "mainTense": "e.g. Present Perfect Continuous / Second Conditional",
  "structures": [
    {
      "name": "Nome da estrutura (ex: Relative Clause, Phrasal Verb)",
      "element": "Trecho da frase",
      "explanationPt": "Como funciona e como usar no dia a dia",
      "alternativeExamples": ["Exemplo similar 1", "Exemplo similar 2"]
    }
  ],
  "keyVocabulary": [
    {
      "term": "termo",
      "meaningPt": "significado",
      "cefr": "B2"
    }
  ],
  "culturalOrIdiomaticNuance": "Nuances culturais ou de registro (formal/informal)"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/explain-grammar:', error);
    return res.status(500).json({ error: error.message || 'Failed to explain grammar' });
  }
});

// 7. TTS Audio Generation for Words and Sentences
app.post('/api/generate-tts', async (req, res) => {
  try {
    const { text, voice = 'Kore', speed = 'normal' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const speedInstruction = speed === 'slow' ? 'Speak clearly at a deliberate, relaxed teaching pace.' : 'Speak naturally, clearly and articulately.';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${speedInstruction} ${text}`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: 'No audio returned from Gemini TTS' });
    }

    return res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (error: any) {
    console.error('Error in /api/generate-tts:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate TTS' });
  }
});

// Serve frontend with Vite in development
async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EchoLingo server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
