
import React, { useState, useEffect } from 'react';
import { AppState, Book, BrainstormConfig, LLMConfig, PromptKind, ProviderConfigs, SuggestionConfig, SummaryConfig } from './types';
import { Library } from './components/Library';
import { Editor } from './components/Editor';
import { db } from './services/db';

const STORAGE_KEY = 'storyweaver_data';

const DEFAULT_GOOGLE_CONFIG: LLMConfig = { provider: 'google', apiKey: '', modelName: 'gemini-2.5-flash', availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro'] };
const DEFAULT_OPENROUTER_CONFIG: LLMConfig = { provider: 'openrouter', apiKey: '', modelName: 'google/gemini-2.0-flash-001', availableModels: [] };
const DEFAULT_LMSTUDIO_CONFIG: LLMConfig = { provider: 'lmstudio', apiKey: '', modelName: 'local-model', baseUrl: 'http://localhost:1234/v1', availableModels: [] };
const DEFAULT_VENICE_CONFIG: LLMConfig = { provider: 'venice', apiKey: '', modelName: 'llama-3.3-70b', availableModels: [] };

const DEFAULT_PROVIDER_CONFIGS: ProviderConfigs = {
  google: DEFAULT_GOOGLE_CONFIG,
  openrouter: DEFAULT_OPENROUTER_CONFIG,
  lmstudio: DEFAULT_LMSTUDIO_CONFIG,
  venice: DEFAULT_VENICE_CONFIG
};

const DEFAULT_SYSTEM_INSTRUCTION = `You are a co-author. 
Write in {pov} using {tense}.
Style: Engaging, descriptive, and coherent with the existing text.
Output: Only the story continuation. Respond with exactly one paragraph of 3–5 sentences. Do not use bullet points or lists. No meta-talk.`;

const DEFAULT_BRAINSTORM_CONFIG: BrainstormConfig = {
    provider: 'google',
    model: 'gemini-2.5-flash',
    systemInstruction: 'You are a helpful creative writing assistant. Help the user brainstorm ideas, solve plot holes, and develop characters. \n\nVariables available: {currentChapter}, {pov}, {tense}, {chapterSummary:1}, {lastWords:500}'
};

const DEFAULT_SUMMARY_CONFIG: SummaryConfig = {
    provider: 'google',
    model: 'gemini-2.5-flash',
    systemInstruction: 'Summarize the provided chapter content. Respond with exactly one paragraph of 3–5 sentences. Do not use bullet points or lists. Focus on key plot points and character developments.'
};

const DEFAULT_SUGGESTION_CONFIG: SuggestionConfig = {
    provider: 'google',
    model: 'gemini-2.5-flash',
    count: 5,
    systemInstruction: `You are a creative writing assistant. Generate {count} distinct plot suggestions for the next scene based on the context.

REQUIRED CHARACTERS (Must be included):
{characters}

ADDITIONAL KEYWORDS/ELEMENTS (Must be included):
{keywords}

Return ONLY a valid JSON array matching this structure:
[
  {
    "suggestionSummary": "One sentence summary.",
    "suggestionDescription": "Detailed description (max 5 sentences)."
  }
]
Do not add markdown formatting or explanations outside the JSON.`
};

const App: React.FC = () => {
  // --- State Initialization ---
  const [state, setState] = useState<AppState>({
    view: 'library',
    activeBookId: null,
    activeChapterId: null,
    books: [],
    brainstormConfig: DEFAULT_BRAINSTORM_CONFIG,
    summaryConfig: DEFAULT_SUMMARY_CONFIG,
    suggestionConfig: DEFAULT_SUGGESTION_CONFIG,
    providerConfigs: DEFAULT_PROVIDER_CONFIGS,
    promptKinds: []
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // --- Data Loading & Migration ---
  useEffect(() => {
    const initData = async () => {
      try {
        // 1. Load from IndexedDB
        const dbBooks = await db.getAllBooks();
        const dbSettings = await db.getSettings();
        const dbPromptKinds = await db.getAllPromptKinds();

        // Prepare Data
        let promptKinds = dbPromptKinds as any[]; 
        let brainstormConfig = dbSettings?.brainstorm || DEFAULT_BRAINSTORM_CONFIG;
        let summaryConfig = dbSettings?.summary || DEFAULT_SUMMARY_CONFIG;
        let suggestionConfig = dbSettings?.suggestion || DEFAULT_SUGGESTION_CONFIG;
        
        // Merge loaded providers with defaults to ensure new providers (like venice) are present
        let loadedProviders = dbSettings?.providers || DEFAULT_PROVIDER_CONFIGS;
        // Start with defaults, overwrite with loaded values (preserving user keys/baseUrls), ensuring new keys exist
        let providerConfigs = { ...DEFAULT_PROVIDER_CONFIGS, ...loadedProviders };

        // Migration: PromptKinds
        const migratedPromptKinds: PromptKind[] = promptKinds.map((pk: any) => {
             // Handle old format
             const base = pk.config ? {
                 id: pk.id,
                 name: pk.name,
                 description: pk.description,
                 systemInstruction: pk.systemInstruction,
                 provider: pk.config.provider || 'google',
                 model: pk.config.modelName || 'gemini-2.5-flash',
             } : pk;
             
             // Ensure defaults for new fields
             return {
                 ...base,
                 maxTokens: base.maxTokens || 2048,
                 temperature: base.temperature ?? 0.7
             } as PromptKind;
        });

        // Ensure default prompt kind
        if (migratedPromptKinds.length === 0) {
            const defaultKind: PromptKind = {
                id: 'default-story-continuation',
                name: 'Continue Story',
                description: 'Standard story continuation based on context.',
                systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
                provider: 'google',
                model: 'gemini-2.5-flash',
                maxTokens: 2048,
                temperature: 0.7
            };
            await db.savePromptKind(defaultKind);
            migratedPromptKinds.push(defaultKind);
        }

        // Migration: Old "llmConfig" settings to "brainstormConfig"
        if (dbSettings && !dbSettings.brainstorm && (dbSettings as any).active) {
            const oldActive = (dbSettings as any).active;
            brainstormConfig = {
                provider: oldActive.provider || 'google',
                model: oldActive.modelName || 'gemini-2.5-flash',
                systemInstruction: DEFAULT_BRAINSTORM_CONFIG.systemInstruction
            };
            // Also ensure provider config is set from old active
             if (!dbSettings?.providers) {
                const p = oldActive.provider || 'google';
                providerConfigs = {
                    ...DEFAULT_PROVIDER_CONFIGS,
                    [p]: { ...DEFAULT_PROVIDER_CONFIGS[p as keyof ProviderConfigs], ...oldActive }
                };
             }
        }

        // Migration: Update suggestion config system instruction if it's the old default (missing {characters})
        // This ensures the new template variables are available for use
        if (suggestionConfig.systemInstruction.indexOf('{characters}') === -1) {
             // Only update if it looks like the standard default (to avoid overwriting user custom instructions unnecessarily, though here we prioritize functionality)
             // We'll trust the default update is better if the old one didn't have the required tag.
             if (suggestionConfig.systemInstruction.includes('Return ONLY a valid JSON array')) {
                  suggestionConfig = {
                      ...suggestionConfig,
                      systemInstruction: DEFAULT_SUGGESTION_CONFIG.systemInstruction
                  };
             }
        }

        // Migration: Ensure books have characters array and characters have image property, and POV/Tense
        const migratedBooks = dbBooks.map(b => ({
            ...b,
            pov: b.pov || '3rd Person Omniscient',
            tense: b.tense || 'Past Tense',
            characters: (b.characters || []).map((c: any) => ({
                ...c,
                image: c.image || null
            }))
        }));

        // Save migrated defaults if missing in DB (lazy migration)
        if (!dbSettings?.summary || !dbSettings?.providers || !dbSettings?.suggestion) {
            await db.saveSettings(brainstormConfig, summaryConfig, suggestionConfig, providerConfigs);
        }

        setState(prev => ({
            ...prev,
            books: migratedBooks,
            brainstormConfig: brainstormConfig,
            summaryConfig: summaryConfig,
            suggestionConfig: suggestionConfig,
            providerConfigs: providerConfigs,
            promptKinds: migratedPromptKinds
        }));
      } catch (err) {
        console.error("DB Initialization error", err);
      } finally {
        setIsLoaded(true);
      }
    };

    initData();
  }, []);

  // --- Actions ---

  const createBook = () => {
    const newBook: Book = {
      id: crypto.randomUUID(),
      title: 'Untitled Story',
      coverImage: null,
      chapters: [],
      codex: [],
      characters: [],
      lastModified: Date.now(),
      pov: '3rd Person Omniscient',
      tense: 'Past Tense'
    };
    db.saveBook(newBook).catch(console.error);
    setState(prev => ({ ...prev, books: [...prev.books, newBook] }));
  };

  const updateBook = (id: string, updates: Partial<Book>) => {
    setState(prev => {
      const newBooks = prev.books.map(b => {
        if (b.id === id) {
          const updated = { ...b, ...updates };
          db.saveBook(updated).catch(console.error);
          return updated;
        }
        return b;
      });
      return { ...prev, books: newBooks };
    });
  };

  const deleteBook = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this book?")) return;
    db.deleteBook(id).catch(console.error);
    setState(prev => ({
      ...prev,
      books: prev.books.filter(b => b.id !== id),
      activeBookId: prev.activeBookId === id ? null : prev.activeBookId
    }));
  };

  const openBook = (id: string) => {
    setState(prev => ({ ...prev, activeBookId: id, view: 'editor' }));
  };

  const closeBook = () => {
    setState(prev => ({ ...prev, activeBookId: null, view: 'library' }));
  };

  const updateSettings = (brainstormConfig: BrainstormConfig, summaryConfig: SummaryConfig, suggestionConfig: SuggestionConfig, providerConfigs: ProviderConfigs) => {
    db.saveSettings(brainstormConfig, summaryConfig, suggestionConfig, providerConfigs).catch(console.error);
    setState(prev => ({ ...prev, brainstormConfig, summaryConfig, suggestionConfig, providerConfigs }));
  };

  const managePromptKinds = {
      add: (kind: PromptKind) => {
          db.savePromptKind(kind).catch(console.error);
          setState(prev => ({ ...prev, promptKinds: [...prev.promptKinds, kind] }));
      },
      update: (kind: PromptKind) => {
          db.savePromptKind(kind).catch(console.error);
          setState(prev => ({ ...prev, promptKinds: prev.promptKinds.map(k => k.id === kind.id ? kind : k) }));
      },
      delete: (id: string) => {
          db.deletePromptKind(id).catch(console.error);
          setState(prev => ({ ...prev, promptKinds: prev.promptKinds.filter(k => k.id !== id) }));
      }
  };

  if (!isLoaded) {
    return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading...</div>;
  }

  if (state.view === 'editor' && state.activeBookId) {
    const activeBook = state.books.find(b => b.id === state.activeBookId);
    if (activeBook) {
      return (
        <Editor
          book={activeBook}
          onBack={closeBook}
          onUpdateBook={updateBook}
          brainstormConfig={state.brainstormConfig}
          summaryConfig={state.summaryConfig}
          suggestionConfig={state.suggestionConfig}
          providerConfigs={state.providerConfigs}
          onUpdateSettings={updateSettings}
          promptKinds={state.promptKinds}
          onManagePromptKinds={managePromptKinds}
        />
      );
    }
  }

  return (
    <Library
      books={state.books}
      onCreateBook={createBook}
      onOpenBook={openBook}
      onUpdateBook={updateBook}
      onDeleteBook={deleteBook}
    />
  );
};

export default App;
