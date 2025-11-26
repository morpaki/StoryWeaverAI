
import React, { useState, useEffect, useRef } from 'react';
import { Book, Chapter, CodexItem, Character, LLMConfig, Message, PromptKind, ProviderConfigs, LLMProvider, BrainstormConfig, BrainstormContextType, SummaryConfig } from '../types';
import { 
  ArrowLeft, Plus, Save, Send, Sparkles, Settings, BookOpen, 
  MessageSquare, Trash2, RefreshCw, Wand2, FileText, Edit2, X, Globe, RotateCcw, MoreHorizontal, Paperclip, CheckSquare, Square, Users, Image as ImageIcon, User, Sliders, AlertCircle, ChevronDown, PanelLeft, Search
} from 'lucide-react';
import { LLMService } from '../services/llmService';

interface EditorProps {
  book: Book;
  onBack: () => void;
  onUpdateBook: (id: string, updates: Partial<Book>) => void;
  
  brainstormConfig: BrainstormConfig;
  summaryConfig: SummaryConfig;
  providerConfigs: ProviderConfigs;
  onUpdateSettings: (brainstorm: BrainstormConfig, summary: SummaryConfig, providers: ProviderConfigs) => void;

  promptKinds: PromptKind[];
  onManagePromptKinds: {
      add: (kind: PromptKind) => void;
      update: (kind: PromptKind) => void;
      delete: (id: string) => void;
  };
}

const POV_OPTIONS = [
    "3rd Person Omniscient",
    "3rd Person Limited",
    "1st Person",
    "2nd Person"
];

const TENSE_OPTIONS = [
    "Past Tense",
    "Present Tense",
    "Future Tense"
];

// --- Custom Components ---

const SearchableModelSelect = ({ value, options, onChange, placeholder, disabled }: {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search
  const filtered = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 text-left flex justify-between items-center ${disabled ? 'opacity-50' : ''}`}
      >
        <span className="truncate">{value || placeholder || "Select Model"}</span>
        <ChevronDown size={14} className="text-slate-500 shrink-0 ml-2"/>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl flex flex-col max-h-60">
           <div className="p-2 border-b border-slate-800 sticky top-0 bg-slate-900 z-10 rounded-t-lg">
             <div className="flex items-center bg-slate-950 border border-slate-800 rounded px-2 gap-2">
                <Search size={12} className="text-slate-500"/>
                <input 
                  autoFocus
                  className="bg-transparent border-none outline-none text-sm py-1 w-full text-slate-200"
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
             </div>
           </div>
           <div className="overflow-y-auto flex-1 custom-scrollbar p-1">
              {filtered.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { onChange(opt); setIsOpen(false); setSearch(''); }}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-slate-800 ${opt === value ? 'text-indigo-400 bg-indigo-900/20' : 'text-slate-300'}`}
                  >
                    {opt}
                  </button>
              ))}
              {filtered.length === 0 && !search && (
                  <div className="px-2 py-2 text-xs text-slate-500 text-center italic">No models available</div>
              )}
              {search && !filtered.includes(search) && (
                  <button
                    onClick={() => { onChange(search); setIsOpen(false); setSearch(''); }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-slate-800 text-indigo-300 italic border-t border-slate-800 mt-1"
                  >
                    Use custom: "{search}"
                  </button>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export const Editor: React.FC<EditorProps> = ({
  book,
  onBack,
  onUpdateBook,
  brainstormConfig,
  summaryConfig,
  providerConfigs,
  onUpdateSettings,
  promptKinds,
  onManagePromptKinds
}) => {
  const [activeChapterId, setActiveChapterId] = useState<string | null>(
    book.chapters.length > 0 ? book.chapters[0].id : null
  );
  
  // Tabs state
  const [leftTab, setLeftTab] = useState<'chapters' | 'brainstorm' | 'characters'>('chapters');
  const [rightTab, setRightTab] = useState<'codex' | 'settings'>('codex');
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);

  // Chat states
  const [brainstormMessages, setBrainstormMessages] = useState<Message[]>([]);
  const [brainstormInput, setBrainstormInput] = useState('');
  const [brainstormContextType, setBrainstormContextType] = useState<BrainstormContextType>('none');
  const [brainstormSelectedChapters, setBrainstormSelectedChapters] = useState<string[]>([]);
  const [isContextSelectorOpen, setIsContextSelectorOpen] = useState(false);
  
  // Prompt State
  const [promptInput, setPromptInput] = useState('');
  const [selectedKindId, setSelectedKindId] = useState<string>(promptKinds[0]?.id || '');
  const [isGenerating, setIsGenerating] = useState(false);

  // Retry State
  const [lastGeneration, setLastGeneration] = useState<{ prompt: string; responseLength: number; kindId: string } | null>(null);

  // Error State
  const [errorState, setErrorState] = useState<{ short: string; full: string } | null>(null);

  // Codex management
  const [newCodexTitle, setNewCodexTitle] = useState('');
  const [newCodexTags, setNewCodexTags] = useState('');
  const [newCodexContent, setNewCodexContent] = useState('');
  const [newCodexIsGlobal, setNewCodexIsGlobal] = useState(false);
  const [editingCodexId, setEditingCodexId] = useState<string | null>(null);

  // Character management
  const [charName, setCharName] = useState('');
  const [charAliases, setCharAliases] = useState('');
  const [charDesc, setCharDesc] = useState('');
  const [charIsGlobal, setCharIsGlobal] = useState(false);
  const [charImage, setCharImage] = useState<string | null>(null);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);

  // Summary Modal State
  const [summaryModalChapterId, setSummaryModalChapterId] = useState<string | null>(null);
  const [summaryEditText, setSummaryEditText] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Prompt Kind Editing Modal
  const [editingKind, setEditingKind] = useState<PromptKind | null>(null);
  const [isKindModalOpen, setIsKindModalOpen] = useState(false);
  
  // Settings Tab State
  const [settingsSelectedProvider, setSettingsSelectedProvider] = useState<LLMProvider>('google');
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const activeChapter = book.chapters.find(c => c.id === activeChapterId);

  // Initialize selected kind if promptKinds changes
  useEffect(() => {
      if (!selectedKindId && promptKinds.length > 0) {
          setSelectedKindId(promptKinds[0].id);
      }
  }, [promptKinds, selectedKindId]);

  // Auto-scroll chat
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [brainstormMessages]);

  // --- Template Parsing ---

  const parseTemplate = (text: string, currentBook: Book, currentChapter: Chapter | undefined): string => {
    let result = text;

    // {pov}
    result = result.replace(/{pov}/g, currentBook.pov || '3rd Person Omniscient');

    // {tense}
    result = result.replace(/{tense}/g, currentBook.tense || 'Past Tense');

    // {currentChapter}
    result = result.replace(/{currentChapter}/g, currentChapter ? currentChapter.content : '');

    // {lastWords:N}
    result = result.replace(/{lastWords:(\d+)}/g, (match, numStr) => {
        if (!currentChapter) return '';
        const n = parseInt(numStr, 10);
        if (isNaN(n) || n <= 0) return '';
        
        // Split by whitespace to approximate words
        const words = currentChapter.content.trim().split(/\s+/);
        if (words.length === 0 || (words.length === 1 && words[0] === '')) return '';
        return words.slice(-n).join(' ');
    });

    // {chapterSummary:N} (Assumes N is 1-based Index/Order)
    result = result.replace(/{chapterSummary:(\d+)}/g, (match, numStr) => {
        const n = parseInt(numStr, 10);
        if (isNaN(n) || n <= 0) return '';
        
        // Sort chapters by order to match the user's "Chapter 1, Chapter 2" expectation
        const sortedChapters = [...currentBook.chapters].sort((a, b) => a.order - b.order);
        const targetChapter = sortedChapters[n - 1];
        
        return targetChapter ? (targetChapter.summary || 'No summary available') : 'Chapter not found';
    });

    return result;
  };

  // --- Data Helpers ---
  
  const updateChapter = (chapterId: string, data: Partial<Chapter>) => {
    const updatedChapters = book.chapters.map(c => 
      c.id === chapterId ? { ...c, ...data } : c
    );
    onUpdateBook(book.id, { chapters: updatedChapters, lastModified: Date.now() });
  };

  const addChapter = () => {
    const newChapter: Chapter = {
      id: crypto.randomUUID(),
      title: `Chapter ${book.chapters.length + 1}`,
      summary: '',
      content: '',
      order: book.chapters.length
    };
    onUpdateBook(book.id, { 
      chapters: [...book.chapters, newChapter],
      lastModified: Date.now() 
    });
    setActiveChapterId(newChapter.id);
  };

  // --- Codex Helpers ---

  const saveCodex = () => {
    if (!newCodexTitle || !newCodexContent) return;
    
    const tagsArray = newCodexTags.split(',').map(t => t.trim()).filter(t => t);
    
    if (editingCodexId) {
      const updatedCodex = book.codex.map(c => 
        c.id === editingCodexId 
          ? { ...c, title: newCodexTitle, content: newCodexContent, tags: tagsArray, isGlobal: newCodexIsGlobal }
          : c
      );
      onUpdateBook(book.id, { codex: updatedCodex });
      setEditingCodexId(null);
    } else {
      const newItem: CodexItem = {
        id: crypto.randomUUID(),
        title: newCodexTitle,
        content: newCodexContent,
        tags: tagsArray,
        isGlobal: newCodexIsGlobal
      };
      onUpdateBook(book.id, { codex: [...book.codex, newItem] });
    }
    // Reset form
    setNewCodexTitle('');
    setNewCodexTags('');
    setNewCodexContent('');
    setNewCodexIsGlobal(false);
  };

  const editCodex = (item: CodexItem) => {
    setEditingCodexId(item.id);
    setNewCodexTitle(item.title);
    setNewCodexTags(item.tags.join(', '));
    setNewCodexContent(item.content);
    setNewCodexIsGlobal(item.isGlobal || false);
    setRightTab('codex');
  };

  const deleteCodex = (id: string) => {
    const updated = book.codex.filter(c => c.id !== id);
    onUpdateBook(book.id, { codex: updated });
  };

  // --- Character Helpers ---

  const saveCharacter = () => {
    if (!charName || !charDesc) return;
    
    const aliasesArray = charAliases.split(',').map(t => t.trim()).filter(t => t);

    if (editingCharId) {
        const updatedChars = (book.characters || []).map(c => 
            c.id === editingCharId
                ? { ...c, name: charName, aliases: aliasesArray, description: charDesc, isGlobal: charIsGlobal, image: charImage }
                : c
        );
        onUpdateBook(book.id, { characters: updatedChars });
        setEditingCharId(null);
    } else {
        const newChar: Character = {
            id: crypto.randomUUID(),
            name: charName,
            aliases: aliasesArray,
            description: charDesc,
            isGlobal: charIsGlobal,
            image: charImage
        };
        onUpdateBook(book.id, { characters: [...(book.characters || []), newChar] });
    }

    // Reset
    setCharName('');
    setCharAliases('');
    setCharDesc('');
    setCharIsGlobal(false);
    setCharImage(null);
  };

  const cancelEditCharacter = () => {
      setEditingCharId(null);
      setCharName('');
      setCharAliases('');
      setCharDesc('');
      setCharIsGlobal(false);
      setCharImage(null);
  };

  const editCharacter = (char: Character) => {
      setEditingCharId(char.id);
      setCharName(char.name);
      setCharAliases(char.aliases.join(', '));
      setCharDesc(char.description);
      setCharIsGlobal(char.isGlobal);
      setCharImage(char.image || null);
  };

  const deleteCharacter = (id: string) => {
      const updated = (book.characters || []).filter(c => c.id !== id);
      onUpdateBook(book.id, { characters: updated });
  };

  const handleCharImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Prompt Kind Helpers ---
  
  const openNewPromptKindModal = () => {
      setEditingKind({
          id: crypto.randomUUID(),
          name: 'New Prompt Kind',
          description: '',
          systemInstruction: "You are a co-author. Write in {pov} using {tense}. Style: Engaging, descriptive. Output: Only story continuation.",
          provider: 'google',
          model: 'gemini-2.5-flash',
          maxTokens: 2048,
          temperature: 0.7
      });
      setIsKindModalOpen(true);
  };

  const openEditPromptKindModal = (kindId: string) => {
      const kind = promptKinds.find(k => k.id === kindId);
      if (kind) {
          setEditingKind({ ...kind });
          setIsKindModalOpen(true);
      }
  };

  const savePromptKind = () => {
      if (editingKind) {
          const exists = promptKinds.find(k => k.id === editingKind.id);
          if (exists) {
              onManagePromptKinds.update(editingKind);
          } else {
              onManagePromptKinds.add(editingKind);
              setSelectedKindId(editingKind.id);
          }
          setIsKindModalOpen(false);
          setEditingKind(null);
      }
  };

  const deletePromptKind = (id: string) => {
      if (promptKinds.length <= 1) {
          alert("You must have at least one prompt kind.");
          return;
      }
      if (confirm("Delete this prompt kind?")) {
          onManagePromptKinds.delete(id);
          if (selectedKindId === id) {
              setSelectedKindId(promptKinds.find(k => k.id !== id)?.id || '');
          }
      }
  };

  // --- LLM Operations ---

  const getRuntimeConfig = (provider: LLMProvider, modelName: string, overrides?: Partial<LLMConfig>): LLMConfig => {
      const globalConf = providerConfigs[provider];
      return {
          ...globalConf,
          modelName: modelName, // Override with specific model
          ...overrides
      };
  };

  const handleError = (error: any) => {
      const msg = error instanceof Error ? error.message : "An unknown error occurred";
      const full = error instanceof Error ? (error.stack || msg) : JSON.stringify(error, null, 2);
      setErrorState({ short: msg, full: full });
  };

  const generateStory = async (overridePrompt?: string, overrideContent?: string) => {
    const activePrompt = overridePrompt !== undefined ? overridePrompt : promptInput;
    const currentChapterContent = overrideContent !== undefined ? overrideContent : (activeChapter?.content || '');
    
    if (!activePrompt.trim() || !activeChapter) return;
    
    // Find selected Prompt Kind
    const selectedKind = promptKinds.find(k => k.id === selectedKindId);
    if (!selectedKind) {
        alert("No prompt kind selected");
        return;
    }

    setIsGenerating(true);
    setErrorState(null);

    // 1. Identify Codex Items
    const relevantCodex = book.codex.filter(item => 
      item.isGlobal || 
      item.tags.some(tag => activePrompt.toLowerCase().includes(tag.toLowerCase()))
    );

    // 2. Identify Character Items with Chaining
    const allChars = book.characters || [];
    const includedCharIds = new Set<string>();
    const relevantChars: Character[] = [];

    // Helper to check if text contains any alias of a character
    const hasAliasMatch = (text: string, char: Character) => {
        return char.aliases.some(alias => text.toLowerCase().includes(alias.toLowerCase()));
    };

    // Initial Scan: Globals + Prompt Matches
    for (const char of allChars) {
        if (char.isGlobal || hasAliasMatch(activePrompt, char)) {
            if (!includedCharIds.has(char.id)) {
                includedCharIds.add(char.id);
                relevantChars.push(char);
            }
        }
    }

    // Chain Scan
    let i = 0;
    while (i < relevantChars.length) {
        const currentChar = relevantChars[i];
        i++;
        if (!currentChar.description) continue;
        for (const candidate of allChars) {
            if (!includedCharIds.has(candidate.id)) {
                if (hasAliasMatch(currentChar.description, candidate)) {
                    includedCharIds.add(candidate.id);
                    relevantChars.push(candidate);
                }
            }
        }
    }

    // 3. Build System Instruction with Template Parsing
    let rawSystemInstruction = selectedKind.systemInstruction
        .replace('{Title}', book.title)
        .replace('{ChapterTitle}', activeChapter.title)
        .replace('{ChapterSummary}', activeChapter.summary);
    
    // Apply Parsers
    let systemInstruction = parseTemplate(rawSystemInstruction, book, activeChapter);

    const contextBlocks: string[] = [];

    // Inject Story So Far (Previous Chapter Summaries)
    const sortedChapters = [...book.chapters].sort((a, b) => a.order - b.order);
    const previousChapters = sortedChapters.filter(c => c.order < activeChapter.order);
    const storySoFar = previousChapters
        .filter(c => c.summary && c.summary.trim())
        .map(c => `[${c.title}]: ${c.summary}`)
        .join('\n');
    
    if (storySoFar) {
        contextBlocks.push(`STORY SO FAR:\n${storySoFar}`);
    }

    // Merge Codex and Characters into a unified context list
    const combinedContextItems: string[] = [];

    if (relevantCodex.length > 0) {
        relevantCodex.forEach(c => {
             combinedContextItems.push(`[${c.title}${c.isGlobal ? ' (Global)' : ''}]: ${c.content}`);
        });
    }

    if (relevantChars.length > 0) {
        relevantChars.forEach(c => {
            combinedContextItems.push(`[${c.name}]: ${c.description}`);
        });
    }

    if (combinedContextItems.length > 0) {
        contextBlocks.push(combinedContextItems.join('\n'));
    }

    if (contextBlocks.length > 0) {
        systemInstruction += `\n\nIMPORTANT CONTEXT:\n${contextBlocks.join('\n\n')}`;
    }

    // 4. Build Full Prompt
    const fullPrompt = `
    Existing Content (Last 1500 chars): 
    "${currentChapterContent.slice(-1500)}"
    
    Instruction: ${activePrompt}`;

    // 5. Construct Configuration on the fly
    const config = getRuntimeConfig(selectedKind.provider, selectedKind.model, {
        maxTokens: selectedKind.maxTokens || 2048,
        temperature: selectedKind.temperature ?? 0.7
    });

    try {
      const result = await LLMService.generateCompletion(
          fullPrompt, 
          systemInstruction, 
          config
      );
      
      const newContent = currentChapterContent + (currentChapterContent && result ? "\n\n" : "") + result;
      updateChapter(activeChapter.id, { content: newContent });
      
      setLastGeneration({
          prompt: activePrompt,
          responseLength: result.length + (currentChapterContent && result ? 2 : 0),
          kindId: selectedKindId
      });

      setPromptInput('');
    } catch (error: any) {
      handleError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetry = () => {
      if (!lastGeneration || !activeChapter) return;
      const currentContent = activeChapter.content;
      const cleanContent = currentContent.slice(0, -lastGeneration.responseLength);
      updateChapter(activeChapter.id, { content: cleanContent });
      setPromptInput(lastGeneration.prompt);
      generateStory(lastGeneration.prompt, cleanContent);
  };

  // --- Settings & Models Logic ---

  const handleFetchModelsForSettings = async () => {
      const config = providerConfigs[settingsSelectedProvider];
      setIsFetchingModels(true);
      setErrorState(null);
      try {
        const models = await LLMService.listModels(config);
        const updatedConfig = { ...config, availableModels: models };
        onUpdateSettings(brainstormConfig, summaryConfig, { ...providerConfigs, [settingsSelectedProvider]: updatedConfig });
        alert(`Successfully loaded ${models.length} models for ${settingsSelectedProvider.toUpperCase()}`);
      } catch (e) {
          handleError(e);
      } finally {
          setIsFetchingModels(false);
      }
  }

  const updateProviderConfig = (provider: LLMProvider, updates: Partial<LLMConfig>) => {
      const current = providerConfigs[provider];
      const updated = { ...current, ...updates };
      onUpdateSettings(brainstormConfig, summaryConfig, { ...providerConfigs, [provider]: updated });
  };

  const getBrainstormContext = (): string => {
      if (brainstormContextType === 'none') return '';
      
      let contextText = '';
      
      if (brainstormContextType === 'current_chapter') {
          if (activeChapter) {
              contextText = `CURRENT CHAPTER (${activeChapter.title}):\n${activeChapter.content}`;
          }
      } else if (brainstormContextType === 'all_summaries') {
          contextText = "ALL CHAPTER SUMMARIES:\n" + book.chapters.map(c => `[${c.title}]: ${c.summary || 'No summary'}`).join('\n');
      } else if (brainstormContextType === 'selected_summaries') {
          const selected = book.chapters.filter(c => brainstormSelectedChapters.includes(c.id));
          contextText = "SELECTED SUMMARIES:\n" + selected.map(c => `[${c.title}]: ${c.summary || 'No summary'}`).join('\n');
      }

      return contextText;
  };

  const handleBrainstorm = async () => {
    if (!brainstormInput.trim()) return;
    
    const context = getBrainstormContext();
    const finalPrompt = context ? `CONTEXT:\n${context}\n\nUSER QUESTION: ${brainstormInput}` : brainstormInput;

    const userMsg: Message = { role: 'user', content: brainstormInput }; // Display user's question only
    const newHistory = [...brainstormMessages, userMsg];
    setBrainstormMessages(newHistory);
    setBrainstormInput('');
    setIsGenerating(true);
    setErrorState(null);

    const config = getRuntimeConfig(brainstormConfig.provider, brainstormConfig.model);
    const parsedSystemInstruction = parseTemplate(brainstormConfig.systemInstruction, book, activeChapter);

    try {
      // We send a modified history for this turn, but we store the user's original short message in state
      const apiHistory = [...brainstormMessages, { role: 'user', content: finalPrompt }] as Message[];

      const result = await LLMService.generateCompletion(
          finalPrompt, // prompt argument
          parsedSystemInstruction, 
          config, 
          brainstormMessages 
      );
      
      setBrainstormMessages([...newHistory, { role: 'model', content: result }]);
    } catch (e) {
       handleError(e);
       // We do NOT add the error message to the chat history
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBrainstormRetry = async () => {
    if (brainstormMessages.length < 2) return;
    const lastMsg = brainstormMessages[brainstormMessages.length - 1];
    if (lastMsg.role !== 'model') return;
    
    // Get the user message that prompted the last response
    // History for UI is everything except the last model message
    const historyForUI = brainstormMessages.slice(0, -1);
    const userMsg = historyForUI[historyForUI.length - 1];
    
    if (!userMsg || userMsg.role !== 'user') return;
    
    // History for API is everything before the user message (since user msg becomes prompt)
    const historyForAPI = historyForUI.slice(0, -1);
    
    // Revert UI
    setBrainstormMessages(historyForUI);

    const context = getBrainstormContext();
    const finalPrompt = context ? `CONTEXT:\n${context}\n\nUSER QUESTION: ${userMsg.content}` : userMsg.content;

    setIsGenerating(true);
    setErrorState(null);
    const config = getRuntimeConfig(brainstormConfig.provider, brainstormConfig.model);
    const parsedSystemInstruction = parseTemplate(brainstormConfig.systemInstruction, book, activeChapter);

    try {
      const result = await LLMService.generateCompletion(
          finalPrompt,
          parsedSystemInstruction,
          config,
          historyForAPI
      );
      setBrainstormMessages([...historyForUI, { role: 'model', content: result }]);
    } catch (e) {
       handleError(e);
       // Do not add error to history, just revert state effectively happened in 'setBrainstormMessages(historyForUI)'
    } finally {
      setIsGenerating(false);
    }
  };

  // Summary generation
  const handleGenerateSummaryInModal = async () => {
    const chapter = book.chapters.find(c => c.id === summaryModalChapterId);
    if (!chapter || !chapter.content) return;
    setIsGeneratingSummary(true);
    setErrorState(null);
    
    const config = getRuntimeConfig(summaryConfig.provider, summaryConfig.model);
    
    const parsedInstruction = parseTemplate(summaryConfig.systemInstruction, book, chapter);

    try {
      const prompt = `Content to summarize:\n${chapter.content}`;

      const result = await LLMService.generateCompletion(
        prompt, 
        parsedInstruction, 
        config
      );
      setSummaryEditText(result);
    } catch (e) {
      handleError(e);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const saveSummaryFromModal = () => {
    if (summaryModalChapterId) {
      updateChapter(summaryModalChapterId, { summary: summaryEditText });
      setSummaryModalChapterId(null);
    }
  };

  const openSummaryModal = (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chapter = book.chapters.find(c => c.id === chapterId);
    if (chapter) {
      setSummaryModalChapterId(chapterId);
      setSummaryEditText(chapter.summary || '');
    }
  };

  const toggleChapterSelection = (id: string) => {
      setBrainstormSelectedChapters(prev => 
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 relative">
      {/* Header */}
      <div className="h-14 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors" title="Back to Library">
            <ArrowLeft size={20} />
          </button>
          <button onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)} className={`p-2 hover:bg-slate-800 rounded-full transition-colors ${!isLeftPanelOpen ? 'text-indigo-400' : 'text-slate-400'}`} title="Toggle Sidebar">
             <PanelLeft size={20} />
          </button>
          <h2 className="font-bold text-lg">{book.title} <span className="text-slate-500 text-sm font-normal">/ Editor</span></h2>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2">
            Brainstorming: <span className="text-indigo-400 font-semibold uppercase">{brainstormConfig.provider}</span>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL */}
        <div className={`flex flex-col bg-slate-925 shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${isLeftPanelOpen ? 'w-80 border-r border-slate-800' : 'w-0 border-r-0'}`}>
          <div className="flex border-b border-slate-800">
            <button onClick={() => setLeftTab('chapters')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${leftTab === 'chapters' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`} title="Chapters"><BookOpen size={16} /></button>
            <button onClick={() => setLeftTab('brainstorm')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${leftTab === 'brainstorm' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`} title="Brainstorm"><MessageSquare size={16} /></button>
            <button onClick={() => setLeftTab('characters')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${leftTab === 'characters' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`} title="Characters"><Users size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
            {leftTab === 'chapters' && (
              <div className="space-y-4">
                {book.chapters.map(chapter => (
                  <div key={chapter.id} onClick={() => setActiveChapterId(chapter.id)} className={`p-3 rounded-lg cursor-pointer border transition-all ${activeChapterId === chapter.id ? 'bg-slate-800 border-indigo-500/50 shadow-sm' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <input className="bg-transparent font-semibold text-sm outline-none w-full" value={chapter.title} onChange={(e) => updateChapter(chapter.id, { title: e.target.value })} onClick={(e) => e.stopPropagation()}/>
                      <button onClick={(e) => openSummaryModal(chapter.id, e)} className="text-slate-500 hover:text-indigo-400"><Wand2 size={14} /></button>
                    </div>
                    <div className="text-xs text-slate-400 line-clamp-2 min-h-[2.5em]">{chapter.summary || <span className="italic opacity-50">No summary...</span>}</div>
                  </div>
                ))}
                <button onClick={addChapter} className="w-full py-2 border-2 border-dashed border-slate-800 text-slate-500 rounded-lg hover:border-indigo-500 hover:text-indigo-400 transition-colors flex items-center justify-center gap-2"><Plus size={16} /> Add Chapter</button>
              </div>
            )}

            {leftTab === 'characters' && (
                <div className="space-y-6">
                     <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">{editingCharId ? 'Edit Character' : 'New Character'}</h4>
                        
                        {/* Image Upload */}
                        <div className="flex justify-center mb-3">
                            <div className="relative w-20 h-20 rounded-full bg-slate-950 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden group cursor-pointer hover:border-indigo-500 transition-colors">
                                {charImage ? (
                                    <>
                                        <img src={charImage} alt="Character" className="w-full h-full object-cover" />
                                        <button onClick={(e) => { e.stopPropagation(); setCharImage(null); }} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-400"><Trash2 size={16}/></button>
                                    </>
                                ) : (
                                    <>
                                        <ImageIcon size={20} className="text-slate-600 group-hover:text-indigo-400"/>
                                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleCharImageUpload} />
                                    </>
                                )}
                            </div>
                        </div>

                        <input className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 mb-2 text-sm outline-none focus:border-indigo-500" placeholder="Name (e.g. John Doe)" value={charName} onChange={(e) => setCharName(e.target.value)}/>
                         <div className="flex items-center gap-2 mb-2">
                            <input type="checkbox" id="char-global" checked={charIsGlobal} onChange={(e) => setCharIsGlobal(e.target.checked)} className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"/>
                            <label htmlFor="char-global" className="text-xs text-slate-400 select-none cursor-pointer flex items-center gap-1"><Globe size={12} /> Global</label>
                        </div>
                        <input className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 mb-2 text-sm outline-none focus:border-indigo-500" placeholder="Aliases (comma separated)" value={charAliases} onChange={(e) => setCharAliases(e.target.value)}/>
                        <textarea className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 mb-2 text-sm h-20 resize-none outline-none focus:border-indigo-500" placeholder="Description sent to LLM..." value={charDesc} onChange={(e) => setCharDesc(e.target.value)}/>
                        <div className="flex gap-2">
                            <button onClick={saveCharacter} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-1 rounded text-sm flex items-center justify-center gap-2"><Save size={14} /> {editingCharId ? 'Update' : 'Add'}</button>
                            {editingCharId && (
                                <button onClick={cancelEditCharacter} className="w-8 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded text-sm flex items-center justify-center transition-colors" title="Cancel Editing"><X size={14} /></button>
                            )}
                        </div>
                    </div>
                    <div className="space-y-3">
                        {(book.characters || []).map(char => (
                            <div key={char.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 group hover:border-indigo-500/30 transition-colors flex gap-3">
                                {/* Avatar */}
                                <div className="flex-shrink-0 w-[30%] aspect-square rounded-lg bg-slate-800 overflow-hidden border border-slate-700 self-start">
                                    {char.image ? (
                                        <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-600"><User size={32}/></div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                         <span className="font-bold text-sm text-indigo-300 flex items-center gap-2 truncate">{char.name}{char.isGlobal && <span title="Global Character"><Globe size={12} className="text-green-400" /></span>}</span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => editCharacter(char)} className="p-1 hover:text-white text-slate-500"><Edit2 size={12} /></button><button onClick={() => deleteCharacter(char.id)} className="p-1 hover:text-red-400 text-slate-500"><Trash2 size={12} /></button></div>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mb-2">{char.aliases.map(t => (<span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-full">{t}</span>))}</div>
                                    <p className="text-xs text-slate-400 line-clamp-2">{char.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {leftTab === 'brainstorm' && (
              <div className="flex flex-col h-full">
                <div className="flex-none mb-2">
                    <button onClick={() => setIsContextSelectorOpen(!isContextSelectorOpen)} className={`w-full flex items-center justify-between text-xs px-3 py-2 rounded border ${brainstormContextType !== 'none' ? 'bg-indigo-900/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                       <span className="flex items-center gap-2"><Paperclip size={12} /> Context: {brainstormContextType.replace('_', ' ').toUpperCase()}</span>
                    </button>
                    {isContextSelectorOpen && (
                        <div className="mt-2 bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-xl animate-in fade-in slide-in-from-top-2 space-y-1 z-10">
                            <button onClick={() => { setBrainstormContextType('none'); setIsContextSelectorOpen(false); }} className="w-full text-left text-xs px-2 py-1.5 hover:bg-slate-800 rounded text-slate-300">None</button>
                            <button onClick={() => { setBrainstormContextType('current_chapter'); setIsContextSelectorOpen(false); }} className="w-full text-left text-xs px-2 py-1.5 hover:bg-slate-800 rounded text-slate-300">Current Chapter</button>
                            <button onClick={() => { setBrainstormContextType('all_summaries'); setIsContextSelectorOpen(false); }} className="w-full text-left text-xs px-2 py-1.5 hover:bg-slate-800 rounded text-slate-300">All Summaries</button>
                            <button onClick={() => setBrainstormContextType('selected_summaries')} className="w-full text-left text-xs px-2 py-1.5 hover:bg-slate-800 rounded text-slate-300">Select Summaries...</button>
                            
                            {brainstormContextType === 'selected_summaries' && (
                                <div className="border-t border-slate-700 pt-2 mt-1 max-h-40 overflow-y-auto">
                                    {book.chapters.map(c => (
                                        <div key={c.id} onClick={() => toggleChapterSelection(c.id)} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-800 cursor-pointer">
                                            {brainstormSelectedChapters.includes(c.id) ? <CheckSquare size={12} className="text-indigo-400"/> : <Square size={12} className="text-slate-600"/>}
                                            <span className="text-xs text-slate-300 truncate">{c.title}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 mb-3 custom-scrollbar">
                    {brainstormMessages.map((m, idx) => (
                        <div key={idx} className={`p-2 rounded text-sm ${m.role === 'user' ? 'bg-slate-800 ml-4' : 'bg-indigo-900/20 mr-4'}`}>
                            <span className="font-bold text-xs block mb-1 opacity-50">{m.role === 'user' ? 'You' : 'AI'}</span>{m.content}
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2 items-start">
                    <textarea className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 resize-none h-14 custom-scrollbar" placeholder="Ask for ideas..." value={brainstormInput} onChange={(e) => setBrainstormInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBrainstorm(); }}} />
                    <div className="flex flex-col gap-1">
                        <button onClick={handleBrainstorm} disabled={isGenerating} className={`h-8 w-8 rounded flex items-center justify-center transition-colors ${isGenerating ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}><Send size={14} /></button>
                        {brainstormMessages.length > 0 && brainstormMessages[brainstormMessages.length - 1].role === 'model' && !isGenerating && (
                            <button onClick={handleBrainstormRetry} className="h-6 w-8 flex items-center justify-center text-orange-400 hover:bg-slate-900 rounded" title="Retry"><RotateCcw size={12} /></button>
                        )}
                    </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800 bg-slate-950">
          {activeChapter ? (
            <>
              <div className="h-[75%] flex flex-col">
                <div className="flex items-center justify-between px-6 py-2 bg-slate-900/50">
                  <h3 className="text-sm font-bold text-slate-400 tracking-wide uppercase">{activeChapter.title}</h3>
                  <div className="text-xs text-slate-600">{activeChapter.content.length} chars</div>
                </div>
                <textarea className="flex-1 w-full bg-slate-950 p-8 resize-none outline-none text-lg leading-relaxed font-serif text-slate-300 placeholder-slate-700" placeholder="Start writing..." value={activeChapter.content} onChange={(e) => updateChapter(activeChapter.id, { content: e.target.value })}/>
              </div>
              <div className="h-[25%] border-t border-slate-800 bg-slate-900 p-3 flex flex-col">
                 <div className="flex items-center gap-3 mb-2">
                    <Sparkles size={16} className="text-indigo-400" />
                    <div className="relative flex items-center gap-1">
                        <select value={selectedKindId} onChange={(e) => setSelectedKindId(e.target.value)} className="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500 appearance-none pr-8 min-w-[150px]">
                            {promptKinds.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </select>
                        <div className="absolute right-2 pointer-events-none text-slate-500"><MoreHorizontal size={12} /></div>
                    </div>
                    <button onClick={() => openEditPromptKindModal(selectedKindId)} className="p-1 text-slate-500 hover:text-indigo-400" title="Edit Prompt Settings"><Edit2 size={14} /></button>
                     <button onClick={openNewPromptKindModal} className="p-1 text-slate-500 hover:text-indigo-400" title="New Prompt Kind"><Plus size={14} /></button>
                    <div className="flex-1" />
                    {isGenerating && <span className="text-xs text-indigo-400 animate-pulse">Writing...</span>}
                 </div>
                 <div className="flex gap-2 h-full">
                    <textarea className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 resize-none text-sm outline-none focus:border-indigo-500/50 transition-colors" placeholder="Prompt instruction..." value={promptInput} onChange={(e) => setPromptInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateStory(); }}}/>
                    <div className="flex flex-col gap-2">
                        <button onClick={() => generateStory()} disabled={isGenerating} className={`h-10 w-12 rounded-lg flex items-center justify-center transition-colors ${isGenerating ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}><Send size={20} /></button>
                        {lastGeneration && !isGenerating && (
                            <button onClick={handleRetry} className="flex flex-col items-center justify-center text-orange-400 hover:text-orange-300 transition-colors p-1" title="Retry"><RotateCcw size={16} /><span className="text-[10px] font-bold mt-0.5">Retry</span></button>
                        )}
                    </div>
                 </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-600">Select or create a chapter to start writing.</div>
          )}
        </div>

        {/* RIGHT PANEL: Codex & Settings */}
        <div className="w-80 flex flex-col bg-slate-925 shrink-0">
             <div className="flex border-b border-slate-800">
            <button onClick={() => setRightTab('codex')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${rightTab === 'codex' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`}><BookOpen size={16} /> Codex</button>
            <button onClick={() => setRightTab('settings')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${rightTab === 'settings' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`}><Settings size={16} /> Settings</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {rightTab === 'codex' ? (
                <div className="space-y-6">
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">{editingCodexId ? 'Edit Entry' : 'New Codex Entry'}</h4>
                        <input className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 mb-2 text-sm outline-none focus:border-indigo-500" placeholder="Title" value={newCodexTitle} onChange={(e) => setNewCodexTitle(e.target.value)}/>
                         <div className="flex items-center gap-2 mb-2">
                            <input type="checkbox" id="codex-global" checked={newCodexIsGlobal} onChange={(e) => setNewCodexIsGlobal(e.target.checked)} className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"/>
                            <label htmlFor="codex-global" className="text-xs text-slate-400 select-none cursor-pointer flex items-center gap-1"><Globe size={12} /> Global</label>
                        </div>
                        <input className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 mb-2 text-sm outline-none focus:border-indigo-500" placeholder="Tags" value={newCodexTags} onChange={(e) => setNewCodexTags(e.target.value)}/>
                        <textarea className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 mb-2 text-sm h-20 resize-none outline-none focus:border-indigo-500" placeholder="Content..." value={newCodexContent} onChange={(e) => setNewCodexContent(e.target.value)}/>
                        <button onClick={saveCodex} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-1 rounded text-sm flex items-center justify-center gap-2"><Save size={14} /> {editingCodexId ? 'Update' : 'Add'}</button>
                    </div>
                    <div className="space-y-3">
                        {book.codex.map(item => (
                            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 group hover:border-indigo-500/30 transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                     <span className="font-bold text-sm text-indigo-300 flex items-center gap-2">{item.title}{item.isGlobal && <span title="Global Entry"><Globe size={12} className="text-green-400" /></span>}</span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => editCodex(item)} className="p-1 hover:text-white text-slate-500"><Edit2 size={12} /></button><button onClick={() => deleteCodex(item.id)} className="p-1 hover:text-red-400 text-slate-500"><Trash2 size={12} /></button></div>
                                </div>
                                <div className="flex flex-wrap gap-1 mb-2">{item.tags.map(t => (<span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-full">{t}</span>))}</div>
                                <p className="text-xs text-slate-400 line-clamp-3">{item.content}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Book Configuration Section */}
                     <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase mb-4 border-b border-slate-800 pb-2 flex items-center gap-2"><BookOpen size={14}/> Book Configuration</h4>
                        <div className="space-y-3">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Point of View (POV)</label>
                                <div className="relative">
                                    <select 
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 appearance-none"
                                        value={book.pov}
                                        onChange={(e) => onUpdateBook(book.id, { pov: e.target.value })}
                                    >
                                        {POV_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <div className="absolute right-3 top-2.5 pointer-events-none text-slate-500"><MoreHorizontal size={14} /></div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tense</label>
                                <div className="relative">
                                    <select 
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 appearance-none"
                                        value={book.tense}
                                        onChange={(e) => onUpdateBook(book.id, { tense: e.target.value })}
                                    >
                                        {TENSE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <div className="absolute right-3 top-2.5 pointer-events-none text-slate-500"><MoreHorizontal size={14} /></div>
                                </div>
                            </div>
                        </div>
                     </div>

                     <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 border-b border-slate-800 pb-2">Global Provider Configuration</h4>
                        
                        <div className="flex bg-slate-950 rounded p-1 mb-4">
                            {(['google', 'openrouter', 'lmstudio', 'venice'] as LLMProvider[]).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setSettingsSelectedProvider(p)}
                                    className={`flex-1 text-xs py-1 rounded capitalize ${settingsSelectedProvider === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    {p === 'lmstudio' ? 'LM Studio' : p === 'venice' ? 'Venice' : p}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-3 animate-in fade-in duration-300">
                             {settingsSelectedProvider !== 'google' && settingsSelectedProvider !== 'lmstudio' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">API Key</label>
                                    <input 
                                        type="password"
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500"
                                        value={providerConfigs[settingsSelectedProvider]?.apiKey || ''}
                                        onChange={(e) => updateProviderConfig(settingsSelectedProvider, { apiKey: e.target.value })}
                                        placeholder="Enter Key"
                                    />
                                </div>
                             )}

                             {settingsSelectedProvider !== 'google' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Base URL</label>
                                    <input 
                                        type="text"
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500"
                                        value={providerConfigs[settingsSelectedProvider]?.baseUrl || ''}
                                        onChange={(e) => updateProviderConfig(settingsSelectedProvider, { baseUrl: e.target.value })}
                                        placeholder="e.g. http://localhost:1234/v1"
                                    />
                                </div>
                             )}

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                     <label className="block text-xs font-bold text-slate-500 uppercase">Cached Models</label>
                                     <button 
                                        onClick={handleFetchModelsForSettings} 
                                        disabled={isFetchingModels}
                                        className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                     >
                                         <RefreshCw size={10} className={isFetchingModels ? "animate-spin" : ""} /> Refresh List
                                     </button>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 rounded h-32 overflow-y-auto p-2 custom-scrollbar">
                                    {providerConfigs[settingsSelectedProvider]?.availableModels?.length ? (
                                        providerConfigs[settingsSelectedProvider].availableModels?.map(m => (
                                            <div key={m} className="text-xs text-slate-400 py-0.5">{m}</div>
                                        ))
                                    ) : (
                                        <div className="text-xs text-slate-600 italic text-center mt-4">No models loaded. Click Refresh.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                     </div>

                     {/* Brainstorming Configuration Section */}
                     <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase mb-4 border-b border-slate-800 pb-2 flex items-center gap-2"><MessageSquare size={14}/> Brainstorming Config</h4>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Provider</label>
                                <select 
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 capitalize"
                                    value={brainstormConfig.provider}
                                    onChange={(e) => onUpdateSettings({...brainstormConfig, provider: e.target.value as LLMProvider}, summaryConfig, providerConfigs)}
                                >
                                    <option value="google">Google Gemini</option>
                                    <option value="openrouter">OpenRouter</option>
                                    <option value="lmstudio">LM Studio</option>
                                    <option value="venice">Venice AI</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Model</label>
                                <SearchableModelSelect 
                                    value={brainstormConfig.model}
                                    options={providerConfigs[brainstormConfig.provider]?.availableModels || []}
                                    onChange={(val) => onUpdateSettings({...brainstormConfig, model: val}, summaryConfig, providerConfigs)}
                                    placeholder="Select Model"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">System Instruction</label>
                                <textarea 
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm h-24 resize-none outline-none focus:border-indigo-500 leading-relaxed"
                                    value={brainstormConfig.systemInstruction}
                                    onChange={(e) => onUpdateSettings({...brainstormConfig, systemInstruction: e.target.value}, summaryConfig, providerConfigs)}
                                    placeholder="Variables: {currentChapter}, {pov}, {tense}, {chapterSummary:1}, {lastWords:500}"
                                />
                            </div>
                        </div>
                     </div>

                     {/* Auto Summary Configuration Section */}
                     <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase mb-4 border-b border-slate-800 pb-2 flex items-center gap-2"><FileText size={14}/> Auto Summary Config</h4>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Provider</label>
                                <select 
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 capitalize"
                                    value={summaryConfig.provider}
                                    onChange={(e) => onUpdateSettings(brainstormConfig, {...summaryConfig, provider: e.target.value as LLMProvider}, providerConfigs)}
                                >
                                    <option value="google">Google Gemini</option>
                                    <option value="openrouter">OpenRouter</option>
                                    <option value="lmstudio">LM Studio</option>
                                    <option value="venice">Venice AI</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Model</label>
                                <SearchableModelSelect 
                                    value={summaryConfig.model}
                                    options={providerConfigs[summaryConfig.provider]?.availableModels || []}
                                    onChange={(val) => onUpdateSettings(brainstormConfig, {...summaryConfig, model: val}, providerConfigs)}
                                    placeholder="Select Model"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">System Instruction</label>
                                <textarea 
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-sm h-24 resize-none outline-none focus:border-indigo-500 leading-relaxed"
                                    value={summaryConfig.systemInstruction}
                                    onChange={(e) => onUpdateSettings(brainstormConfig, {...summaryConfig, systemInstruction: e.target.value}, providerConfigs)}
                                     placeholder="Variables: {currentChapter}, {pov}, {tense}, {chapterSummary:1}, {lastWords:500}"
                                />
                            </div>
                        </div>
                     </div>
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Notification */}
      {errorState && (
        <div className="fixed bottom-4 right-4 z-50 w-96 bg-slate-900 border border-red-500/50 rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="bg-red-500/10 p-4 border-b border-red-500/20 flex justify-between items-start">
                <div className="flex gap-3">
                    <AlertCircle className="text-red-400 shrink-0" size={20} />
                    <div>
                        <h4 className="font-bold text-red-100 text-sm">Generation Failed</h4>
                        <p className="text-xs text-red-200/80 mt-1">{errorState.short}</p>
                    </div>
                </div>
                <button onClick={() => setErrorState(null)} className="text-red-400 hover:text-red-200"><X size={16}/></button>
            </div>
            <details className="group">
                <summary className="px-4 py-2 text-xs text-slate-500 cursor-pointer hover:bg-slate-800/50 select-none flex items-center gap-2 list-none">
                     <ChevronDown size={12} className="group-open:rotate-180 transition-transform" /> <span>View Full Error Details</span>
                </summary>
                <div className="p-4 bg-slate-950 text-xs font-mono text-red-300/70 whitespace-pre-wrap max-h-40 overflow-y-auto border-t border-slate-800">
                    {errorState.full}
                </div>
            </details>
        </div>
      )}

      {/* Summary Modal */}
      {summaryModalChapterId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSummaryModalChapterId(null)}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[600px] max-w-[90vw] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-850">
                    <h3 className="font-bold text-slate-200 flex items-center gap-2"><FileText size={18} className="text-indigo-400"/> Chapter Summary</h3>
                    <button onClick={() => setSummaryModalChapterId(null)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-4 flex-1 bg-slate-900">
                    <textarea value={summaryEditText} onChange={(e) => setSummaryEditText(e.target.value)} className="w-full h-64 bg-slate-950 p-4 rounded border border-slate-800 outline-none focus:border-indigo-500 resize-none leading-relaxed text-slate-300" placeholder="Write a summary..."/>
                </div>
                <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-850">
                    <button onClick={handleGenerateSummaryInModal} disabled={isGeneratingSummary} className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded transition-colors ${isGeneratingSummary ? 'text-indigo-400 bg-indigo-500/10' : 'text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300'}`}><Sparkles size={16} className={isGeneratingSummary ? "animate-pulse" : ""} /> {isGeneratingSummary ? 'Generating...' : 'Auto-Generate'}</button>
                    <div className="flex gap-3">
                        <button onClick={() => setSummaryModalChapterId(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
                        <button onClick={saveSummaryFromModal} className="px-6 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all">Save Summary</button>
                    </div>
                </div>
            </div>
        </div>
      )}

       {/* Prompt Kind Editor Modal */}
       {isKindModalOpen && editingKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsKindModalOpen(false)}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[600px] max-w-[90vw] flex flex-col overflow-hidden h-[85vh]" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-850">
                    <h3 className="font-bold text-slate-200 flex items-center gap-2"><Sparkles size={18} className="text-indigo-400"/> Configure Prompt Kind</h3>
                    <button onClick={() => setIsKindModalOpen(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Name</label>
                        <input className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-indigo-500" value={editingKind.name} onChange={(e) => setEditingKind({...editingKind, name: e.target.value})} placeholder="e.g., Rewrite Scene"/>
                    </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Description</label>
                        <input className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-indigo-500" value={editingKind.description || ''} onChange={(e) => setEditingKind({...editingKind, description: e.target.value})} placeholder="Short description"/>
                    </div>

                    <div className="p-4 border border-slate-800 rounded-lg bg-slate-950/50 space-y-4">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase mb-2 flex items-center gap-2"><Sliders size={12}/> LLM Configuration</h4>
                        
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Provider</label>
                            <select 
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 capitalize"
                                value={editingKind.provider}
                                onChange={(e) => setEditingKind({ ...editingKind, provider: e.target.value as LLMProvider })}
                            >
                                <option value="google">Google Gemini</option>
                                <option value="openrouter">OpenRouter</option>
                                <option value="lmstudio">LM Studio</option>
                                <option value="venice">Venice AI</option>
                            </select>
                        </div>

                         <div>
                             <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Model Selection</label>
                             <SearchableModelSelect 
                                value={editingKind.model}
                                options={providerConfigs[editingKind.provider]?.availableModels || []}
                                onChange={(val) => setEditingKind({ ...editingKind, model: val })}
                                placeholder="Select a model"
                             />
                             <p className="text-[10px] text-slate-500 mt-1">
                                 Models must be loaded in the <span className="font-bold">Settings</span> tab first.
                             </p>
                         </div>
                         
                         <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Max Tokens</label>
                                <input 
                                    type="number" 
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500"
                                    value={editingKind.maxTokens || 2048}
                                    onChange={(e) => setEditingKind({...editingKind, maxTokens: parseInt(e.target.value) || 0})}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Temperature ({editingKind.temperature ?? 0.7})</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="2" 
                                    step="0.1"
                                    className="w-full accent-indigo-500 mt-2"
                                    value={editingKind.temperature ?? 0.7}
                                    onChange={(e) => setEditingKind({...editingKind, temperature: parseFloat(e.target.value)})}
                                />
                            </div>
                         </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">System Instruction</label>
                         <p className="text-[10px] text-slate-500 mb-1">Variables: &#123;currentChapter&#125;, &#123;pov&#125;, &#123;tense&#125;, &#123;chapterSummary:1&#125;, &#123;lastWords:500&#125;</p>
                        <textarea className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm h-32 resize-none outline-none focus:border-indigo-500 font-mono leading-relaxed" value={editingKind.systemInstruction} onChange={(e) => setEditingKind({...editingKind, systemInstruction: e.target.value})}/>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-850">
                    <button onClick={() => deletePromptKind(editingKind.id)} className="text-red-400 hover:text-red-300 text-sm flex items-center gap-2 px-2"><Trash2 size={16} /> Delete Kind</button>
                    <div className="flex gap-3">
                         <button onClick={() => setIsKindModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
                        <button onClick={savePromptKind} className="px-6 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all">Save</button>
                    </div>
                </div>
            </div>
        </div>
       )}
    </div>
  );
};
