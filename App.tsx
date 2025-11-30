
import React, { useState, useEffect } from 'react';
import { AppState, Book, BrainstormConfig, LLMConfig, PromptKind, ProviderConfigs, SuggestionConfig, SuggestionMode, SummaryConfig } from './types';
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

// Default Prompt Kind Data
const DEFAULT_PROMPT_SYSTEM_ROLE = "You are a co-author. Write in the style of the existing text. No meta-talk.";
const DEFAULT_PROMPT_INSTRUCTION = "Write in {pov} using {tense}. Output exactly one paragraph of 3–5 sentences. Do not use bullet points.";

const DEFAULT_BRAINSTORM_CONFIG: BrainstormConfig = {
    provider: 'google',
    model: 'gemini-2.5-flash',
    systemRole: 'You are a helpful creative writing assistant. Help the user brainstorm ideas, solve plot holes, and develop characters.',
    instruction: 'Variables available: {currentChapter}, {pov}, {tense}, {chapterSummary:1}, {lastWords:500}'
};

const DEFAULT_SUMMARY_CONFIG: SummaryConfig = {
    provider: 'google',
    model: 'gemini-2.5-flash',
    systemRole: 'You are an expert summarizer.',
    instruction: 'Summarize the provided chapter content. Respond with exactly one paragraph of 3–5 sentences. Do not use bullet points or lists. Focus on key plot points and character developments.'
};

const DEFAULT_SUGGESTION_SYSTEM_ROLE = `You are a creative writing assistant. You help generate plot ideas. 
Return ONLY a valid JSON array matching this structure:
[
  {
    "suggestionSummary": "One sentence summary.",
    "suggestionDescription": "Detailed description (max 5 sentences)."
  }
]
Do not add markdown formatting or explanations outside the JSON.`;

const DEFAULT_SUGGESTION_INSTRUCTION = `Generate {count} distinct plot suggestions for the next scene.

STORY SO FAR:
{storySoFar}

REQUIRED CHARACTERS (Must be included):
{characters}

GLOBAL CONTEXT (World Info):
{globalCodex}

ADDITIONAL KEYWORDS/ELEMENTS (Must be included):
{keywords}`;

const DEFAULT_SUGGESTION_CONFIG: SuggestionConfig = {
    provider: 'google',
    model: 'gemini-2.5-flash',
    count: 5,
    systemRole: DEFAULT_SUGGESTION_SYSTEM_ROLE,
    instruction: DEFAULT_SUGGESTION_INSTRUCTION,
    activeModeId: 'mode_plot_dev',
    rephrase: {
        systemRole: "You are a specialized editor. Rewrite the text to be punchier and more evocative while retaining the exact same meaning.",
        instruction: `Rewrite the following plot outline.

CONTEXT:
{globalCodex}

STORY SO FAR:
{storySoFar}

CHARACTERS INVOLVED:
{characters}

ORIGINAL TEXT:
{text}`
    },
    expand: {
        systemRole: "You are a creative writer. Flesh out the plot outline into a detailed beat sheet or scene description.",
        instruction: `Expand the following plot outline into a detailed description (approx 150-200 words). Add sensory details and potential dialogue snippets.

CONTEXT:
{globalCodex}

STORY SO FAR:
{storySoFar}

CHARACTERS INVOLVED:
{characters}

ORIGINAL TEXT:
{text}`
    }
};

const DEFAULT_SUGGESTION_MODES: SuggestionMode[] = [
    {
        id: 'mode_plot_dev',
        name: 'Standard Plot',
        systemRole: DEFAULT_SUGGESTION_SYSTEM_ROLE,
        instruction: DEFAULT_SUGGESTION_INSTRUCTION
    },
    {
        id: 'mode_character',
        name: 'Character Focus',
        systemRole: `You are a character psychology expert. Focus on emotional reactions, internal monologue opportunities, and relationship dynamics.
Return ONLY a valid JSON array matching this structure:
[
  {
    "suggestionSummary": "Focus: Character Name",
    "suggestionDescription": "Detailed moment description."
  }
]`,
        instruction: `Generate {count} suggestions for detailed character moments or emotional beats.

Story So Far:
{storySoFar}

Context:
{globalCodex}

Characters:
{characters}

Keywords:
{keywords}`
    },
    {
        id: 'mode_twist',
        name: 'Plot Twists',
        systemRole: `You are a master of suspense and plot twists. Suggest unexpected turns, secrets revealed, or sudden conflicts.
Return ONLY a valid JSON array matching this structure:
[
  {
    "suggestionSummary": "Twist: The reveal",
    "suggestionDescription": "Description of the twist and immediate consequence."
  }
]`,
        instruction: `Generate {count} shocking plot twists or complications for the current situation.

Story So Far:
{storySoFar}

Context:
{globalCodex}

Characters:
{characters}

Keywords:
{keywords}`
    }
];

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
    suggestionModes: [],
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
        const dbSuggestionModes = await db.getAllSuggestionModes();

        // Prepare Data
        let promptKinds = dbPromptKinds as any[]; 
        
        // Settings with fallbacks
        let brainstormConfig = (dbSettings?.brainstorm || DEFAULT_BRAINSTORM_CONFIG) as any;
        let summaryConfig = (dbSettings?.summary || DEFAULT_SUMMARY_CONFIG) as any;
        let suggestionConfig = (dbSettings?.suggestion || DEFAULT_SUGGESTION_CONFIG) as any;
        
        // Merge loaded providers with defaults
        let loadedProviders = dbSettings?.providers || DEFAULT_PROVIDER_CONFIGS;
        let providerConfigs = { ...DEFAULT_PROVIDER_CONFIGS, ...loadedProviders };

        // --- Migration Logic ---

        // Helper to migrate legacy single-field configs to new structure
        const migrateConfig = (conf: any, defaultRole: string, defaultInst: string) => {
            if (conf.systemInstruction !== undefined && conf.systemRole === undefined) {
                return {
                    ...conf,
                    systemRole: defaultRole,
                    instruction: conf.systemInstruction || defaultInst,
                    systemInstruction: undefined // cleanup
                };
            }
            return conf;
        };

        brainstormConfig = migrateConfig(brainstormConfig, DEFAULT_BRAINSTORM_CONFIG.systemRole, DEFAULT_BRAINSTORM_CONFIG.instruction);
        summaryConfig = migrateConfig(summaryConfig, DEFAULT_SUMMARY_CONFIG.systemRole, DEFAULT_SUMMARY_CONFIG.instruction);
        
        // Special case for suggestion config
        if (suggestionConfig.systemInstruction !== undefined && suggestionConfig.systemRole === undefined) {
             suggestionConfig = {
                 ...suggestionConfig,
                 systemRole: DEFAULT_SUGGESTION_CONFIG.systemRole,
                 instruction: DEFAULT_SUGGESTION_CONFIG.instruction, 
                 systemInstruction: undefined
             };
        } else if (suggestionConfig.instruction && !suggestionConfig.instruction.includes('{globalCodex}')) {
             if (suggestionConfig.instruction.includes('{characters}') && suggestionConfig.instruction.includes('{keywords}')) {
                 suggestionConfig.instruction = DEFAULT_SUGGESTION_CONFIG.instruction;
             }
        }

        if (!suggestionConfig.rephrase) {
            suggestionConfig.rephrase = DEFAULT_SUGGESTION_CONFIG.rephrase;
        }
        if (!suggestionConfig.expand) {
            suggestionConfig.expand = DEFAULT_SUGGESTION_CONFIG.expand;
        }

        // Suggestion Modes Migration/Init
        let suggestionModes = dbSuggestionModes;
        if (suggestionModes.length === 0) {
            // First time load or upgrade, save defaults
            for (const mode of DEFAULT_SUGGESTION_MODES) {
                await db.saveSuggestionMode(mode);
            }
            suggestionModes = DEFAULT_SUGGESTION_MODES;
        }

        // Ensure activeModeId is valid
        if (!suggestionConfig.activeModeId || !suggestionModes.some(m => m.id === suggestionConfig.activeModeId)) {
            suggestionConfig.activeModeId = suggestionModes[0].id;
        }

        // Migration: PromptKinds
        const migratedPromptKinds: PromptKind[] = promptKinds.map((pk: any) => {
             let base = pk.config ? {
                 id: pk.id,
                 name: pk.name,
                 description: pk.description,
                 systemInstruction: pk.systemInstruction,
                 provider: pk.config.provider || 'google',
                 model: pk.config.modelName || 'gemini-2.5-flash',
             } : pk;
             
             if (base.systemInstruction !== undefined && base.systemRole === undefined) {
                 base = {
                     ...base,
                     systemRole: DEFAULT_PROMPT_SYSTEM_ROLE,
                     instruction: base.systemInstruction || DEFAULT_PROMPT_INSTRUCTION,
                     systemInstruction: undefined
                 };
             }
             
             return {
                 ...base,
                 maxTokens: base.maxTokens || 2048,
                 temperature: base.temperature ?? 0.7
             } as PromptKind;
        });

        if (migratedPromptKinds.length === 0) {
            const defaultKind: PromptKind = {
                id: 'default-story-continuation',
                name: 'Continue Story',
                description: 'Standard story continuation based on context.',
                systemRole: DEFAULT_PROMPT_SYSTEM_ROLE,
                instruction: DEFAULT_PROMPT_INSTRUCTION,
                provider: 'google',
                model: 'gemini-2.5-flash',
                maxTokens: 2048,
                temperature: 0.7
            };
            await db.savePromptKind(defaultKind);
            migratedPromptKinds.push(defaultKind);
        }

        const migratedBooks = dbBooks.map(b => ({
            ...b,
            pov: b.pov || '3rd Person Omniscient',
            tense: b.tense || 'Past Tense',
            characters: (b.characters || []).map((c: any) => ({
                ...c,
                image: c.image || null
            }))
        }));

        if (dbSettings) {
             await db.saveSettings(brainstormConfig, summaryConfig, suggestionConfig, providerConfigs);
        }

        setState(prev => ({
            ...prev,
            books: migratedBooks,
            brainstormConfig: brainstormConfig,
            summaryConfig: summaryConfig,
            suggestionConfig: suggestionConfig,
            suggestionModes: suggestionModes,
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

  const manageSuggestionModes = {
      add: (mode: SuggestionMode) => {
          db.saveSuggestionMode(mode).catch(console.error);
          setState(prev => ({ ...prev, suggestionModes: [...prev.suggestionModes, mode] }));
      },
      update: (mode: SuggestionMode) => {
          db.saveSuggestionMode(mode).catch(console.error);
          setState(prev => {
              const newModes = prev.suggestionModes.map(m => m.id === mode.id ? mode : m);
              // Also update active config if this mode is selected
              let newConfig = prev.suggestionConfig;
              if (newConfig.activeModeId === mode.id) {
                  newConfig = { ...newConfig, systemRole: mode.systemRole, instruction: mode.instruction };
                  // save setting side effect
                  db.saveSettings(prev.brainstormConfig, prev.summaryConfig, newConfig, prev.providerConfigs);
              }
              return { ...prev, suggestionModes: newModes, suggestionConfig: newConfig };
          });
      },
      delete: (id: string) => {
          db.deleteSuggestionMode(id).catch(console.error);
          setState(prev => {
              const newModes = prev.suggestionModes.filter(m => m.id !== id);
              let newConfig = prev.suggestionConfig;
              // Fallback if deleted active mode
              if (newConfig.activeModeId === id && newModes.length > 0) {
                  const fallback = newModes[0];
                  newConfig = { ...newConfig, activeModeId: fallback.id, systemRole: fallback.systemRole, instruction: fallback.instruction };
                  db.saveSettings(prev.brainstormConfig, prev.summaryConfig, newConfig, prev.providerConfigs);
              }
              return { ...prev, suggestionModes: newModes, suggestionConfig: newConfig };
          });
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
          suggestionModes={state.suggestionModes}
          onManageSuggestionModes={manageSuggestionModes}
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
