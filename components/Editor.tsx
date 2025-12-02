
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Book, Chapter, CodexItem, Character, LLMConfig, Message, PromptKind, ProviderConfigs, LLMProvider, BrainstormConfig, BrainstormContextType, SummaryConfig, SuggestionConfig, SuggestionMode } from '../types';
import { 
  ArrowLeft, Plus, Save, Send, Sparkles, Settings, BookOpen, 
  MessageSquare, Trash2, RefreshCw, Wand2, FileText, Edit2, X, Globe, RotateCcw, MoreHorizontal, Paperclip, CheckSquare, Square, Users, Image as ImageIcon, User, Sliders, AlertCircle, ChevronDown, PanelLeft, PanelRight, Search, Lightbulb, Check, ChevronUp, Undo2, Maximize2, Palette, Clock, Eye
} from 'lucide-react';
import { LLMService } from '../services/llmService';

interface EditorProps {
  book: Book;
  onBack: () => void;
  onUpdateBook: (id: string, updates: Partial<Book>) => void;
  
  brainstormConfig: BrainstormConfig;
  summaryConfig: SummaryConfig;
  suggestionConfig: SuggestionConfig;
  providerConfigs: ProviderConfigs;
  onUpdateSettings: (brainstorm: BrainstormConfig, summary: SummaryConfig, suggestion: SuggestionConfig, providers: ProviderConfigs) => void;

  promptKinds: PromptKind[];
  onManagePromptKinds: {
      add: (kind: PromptKind) => void;
      update: (kind: PromptKind) => void;
      delete: (id: string) => void;
  };

  suggestionModes: SuggestionMode[];
  onManageSuggestionModes: {
      add: (mode: SuggestionMode) => void;
      update: (mode: SuggestionMode) => void;
      delete: (id: string) => void;
  };
  
  promptHistory: string[];
  onAddToHistory: (prompt: string) => void;
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

interface GeneratedSuggestion {
    id: string;
    suggestionSummary: string;
    suggestionDescription: string;
    characters: Character[]; // Detected or selected characters
    isExpanded: boolean;
}

type LastAction = 
  | { type: 'story_gen'; prompt: string; responseLength: number; kindId: string }
  | { type: 'story_paste'; responseLength: number }
  | { type: 'suggestion_mod'; suggestionId: string; previousDescription: string };

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
  suggestionConfig,
  providerConfigs,
  onUpdateSettings,
  promptKinds,
  onManagePromptKinds,
  suggestionModes,
  onManageSuggestionModes,
  promptHistory,
  onAddToHistory
}) => {
  const [activeChapterId, setActiveChapterId] = useState<string | null>(
    book.chapters.length > 0 ? book.chapters[0].id : null
  );
  
  // Tabs state
  const [leftTab, setLeftTab] = useState<'chapters' | 'brainstorm' | 'suggestions'>('chapters');
  const [rightTab, setRightTab] = useState<'characters' | 'codex'>('characters');
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Settings Modal State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'providers' | 'brainstorm' | 'suggestions' | 'summary'>('general');
  const [suggestionSettingsTab, setSuggestionSettingsTab] = useState<'mode' | 'rephrase' | 'expand'>('mode');
  
  // Suggestion Mode Editing State
  const [editingSuggestionModeId, setEditingSuggestionModeId] = useState<string>(suggestionConfig.activeModeId || suggestionModes[0]?.id || 'new');
  const [editingSuggestionModeData, setEditingSuggestionModeData] = useState<SuggestionMode>({ id: '', name: '', systemRole: '', instruction: '' });

  // Chat states
  const [brainstormMessages, setBrainstormMessages] = useState<Message[]>([]);
  const [brainstormInput, setBrainstormInput] = useState('');
  const [brainstormContextType, setBrainstormContextType] = useState<BrainstormContextType>('none');
  const [brainstormSelectedChapters, setBrainstormSelectedChapters] = useState<string[]>([]);
  const [isContextSelectorOpen, setIsContextSelectorOpen] = useState(false);
  const [isBrainstormGenerating, setIsBrainstormGenerating] = useState(false);
  
  // Suggestion States
  const [generatedSuggestions, setGeneratedSuggestions] = useState<GeneratedSuggestion[]>([]);
  const [suggestionKeywords, setSuggestionKeywords] = useState('');
  const [suggestionSelectedCharIds, setSuggestionSelectedCharIds] = useState<string[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [autoGenerateSuggestions, setAutoGenerateSuggestions] = useState(false);
  const [processingSuggestionId, setProcessingSuggestionId] = useState<string | null>(null);
  
  // Suggestion Editing State
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [editingSuggestionText, setEditingSuggestionText] = useState('');

  // Prompt State
  const [promptInput, setPromptInput] = useState('');
  const [selectedKindId, setSelectedKindId] = useState<string>(promptKinds[0]?.id || '');
  const [isStoryGenerating, setIsStoryGenerating] = useState(false);
  const [lastDebugPrompt, setLastDebugPrompt] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isFullPromptModalOpen, setIsFullPromptModalOpen] = useState(false);

  // Retry/Revert State
  const [lastAction, setLastAction] = useState<LastAction | null>(null);

  // Error State
  const [errorState, setErrorState] = useState<{ short: string; full: string } | null>(null);

  // Typing Effect State
  const [isTyping, setIsTyping] = useState(false);

  // Codex management
  const [newCodexTitle, setNewCodexTitle] = useState('');
  const [newCodexTags, setNewCodexTags] = useState('');
  const [newCodexContent, setNewCodexContent] = useState('');
  const [newCodexIsGlobal, setNewCodexIsGlobal] = useState(false);
  const [editingCodexId, setEditingCodexId] = useState<string | null>(null);
  const [isCodexModalOpen, setIsCodexModalOpen] = useState(false);

  // Character management
  const [charName, setCharName] = useState('');
  const [charAliases, setCharAliases] = useState('');
  const [charDesc, setCharDesc] = useState('');
  const [charIsGlobal, setCharIsGlobal] = useState(false);
  const [charImage, setCharImage] = useState<string | null>(null);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);

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

  // Editor Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storyAbortController = useRef<AbortController | null>(null);
  const brainstormAbortController = useRef<AbortController | null>(null);
  const suggestionAbortController = useRef<AbortController | null>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const typingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeChapter = book.chapters.find(c => c.id === activeChapterId);

  // Auto-resize textarea logic
  useLayoutEffect(() => {
    if (textareaRef.current) {
      // Reset height to allow shrinking
      textareaRef.current.style.height = 'auto';
      // Set to scrollHeight to fit content
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [activeChapter?.content, activeChapterId]);

  // Initialize selected kind if promptKinds changes
  useEffect(() => {
      if (!selectedKindId && promptKinds.length > 0) {
          setSelectedKindId(promptKinds[0].id);
      }
  }, [promptKinds, selectedKindId]);

  // Initialize Suggestion Mode Editor state
  useEffect(() => {
    if (isSettingsModalOpen && suggestionSettingsTab === 'mode') {
        if (editingSuggestionModeId === 'new') {
            setEditingSuggestionModeData({
                id: '',
                name: 'New Mode',
                systemRole: '',
                instruction: ''
            });
        } else {
            const mode = suggestionModes.find(m => m.id === editingSuggestionModeId);
            if (mode) {
                setEditingSuggestionModeData(mode);
            }
        }
    }
  }, [editingSuggestionModeId, isSettingsModalOpen, suggestionSettingsTab, suggestionModes]);

  // Click outside to close history
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
              setIsHistoryOpen(false);
          }
      };
      if (isHistoryOpen) {
          document.addEventListener('mousedown', handleClickOutside);
      }
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHistoryOpen]);

  // Cleanup typing interval on unmount
  useEffect(() => {
      return () => {
          if (typingInterval.current) clearInterval(typingInterval.current);
      }
  }, []);

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

    // {storySoFar}
    result = result.replace(/{storySoFar}/g, () => {
        const sorted = [...currentBook.chapters].sort((a, b) => a.order - b.order);
        const currentOrder = currentChapter ? currentChapter.order : (sorted.length > 0 ? sorted[sorted.length - 1].order + 1 : 0);
        const prev = sorted.filter(c => c.order < currentOrder);
        
        if (prev.length === 0) return "No previous story context.";
        return prev.map(c => `[${c.title}]: ${c.summary || 'No summary'}`).join('\n\n');
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

  const openNewCodexModal = () => {
    setEditingCodexId(null);
    setNewCodexTitle('');
    setNewCodexTags('');
    setNewCodexContent('');
    setNewCodexIsGlobal(false);
    setIsCodexModalOpen(true);
  };

  const openEditCodexModal = (item: CodexItem) => {
    setEditingCodexId(item.id);
    setNewCodexTitle(item.title);
    setNewCodexTags(item.tags.join(', '));
    setNewCodexContent(item.content);
    setNewCodexIsGlobal(item.isGlobal || false);
    setIsCodexModalOpen(true);
  };

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
    setIsCodexModalOpen(false);
  };

  const deleteCodex = (id: string) => {
    const updated = book.codex.filter(c => c.id !== id);
    onUpdateBook(book.id, { codex: updated });
  };

  // --- Character Helpers ---

  const openNewCharacterModal = () => {
    setEditingCharId(null);
    setCharName('');
    setCharAliases('');
    setCharDesc('');
    setCharIsGlobal(false);
    setCharImage(null);
    setIsCharacterModalOpen(true);
  };

  const openEditCharacterModal = (char: Character) => {
      setEditingCharId(char.id);
      setCharName(char.name);
      setCharAliases(char.aliases.join(', '));
      setCharDesc(char.description);
      setCharIsGlobal(char.isGlobal);
      setCharImage(char.image || null);
      setIsCharacterModalOpen(true);
  };

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
    setIsCharacterModalOpen(false);
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
          systemRole: "You are a co-author. Write in the style of the story.",
          instruction: "Write in {pov} using {tense}. Output exactly one paragraph of 3–5 sentences.",
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

  // --- Suggestion Mode Helpers ---

  const handleModeChange = (modeId: string) => {
      const mode = suggestionModes.find(m => m.id === modeId);
      if (mode) {
          // Update the config locally and persist
          onUpdateSettings(
              brainstormConfig, 
              summaryConfig, 
              { 
                  ...suggestionConfig, 
                  activeModeId: mode.id, 
                  systemRole: mode.systemRole, 
                  instruction: mode.instruction 
              }, 
              providerConfigs
          );
      }
  };

  const saveSuggestionMode = () => {
      if (!editingSuggestionModeData.name) {
          alert("Mode name required");
          return;
      }
      
      if (editingSuggestionModeId === 'new') {
          const newMode: SuggestionMode = {
              ...editingSuggestionModeData,
              id: crypto.randomUUID()
          };
          onManageSuggestionModes.add(newMode);
          setEditingSuggestionModeId(newMode.id);
      } else {
          onManageSuggestionModes.update(editingSuggestionModeData);
      }
      alert("Mode Saved");
  };

  const deleteSuggestionMode = (id: string) => {
      if (suggestionModes.length <= 1) {
          alert("Must have at least one mode.");
          return;
      }
      if (confirm("Delete this suggestion mode?")) {
          onManageSuggestionModes.delete(id);
          if (editingSuggestionModeId === id) {
             setEditingSuggestionModeId(suggestionModes.find(m => m.id !== id)?.id || '');
          }
      }
  };

  // --- Suggestion Logic ---
  
  const detectCharacters = (text: string): Character[] => {
      const detected = new Map<string, Character>();
      (book.characters || []).forEach(char => {
          // Detection is based on Name and Aliases (Triggers)
          // using word boundaries to avoid partial matches (e.g. 'Al' in 'Always')
          const triggers = [char.name, ...char.aliases].filter(t => t && t.trim().length > 0);
          
          const isMatch = triggers.some(trigger => {
              const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              try {
                  // Use word boundaries for cleaner matching
                  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
              } catch (e) {
                  return text.toLowerCase().includes(trigger.toLowerCase());
              }
          });

          if (isMatch) {
              detected.set(char.id, char);
          }
      });
      return Array.from(detected.values());
  };

  const handleGenerateSuggestions = async (overrideContent?: string) => {
      if (suggestionAbortController.current) {
          suggestionAbortController.current.abort();
      }
      const ac = new AbortController();
      suggestionAbortController.current = ac;

      setGeneratedSuggestions([]); // Always clear suggestions before generation
      setIsGeneratingSuggestions(true);
      setErrorState(null);
      
      try {
          // Prepare Characters & Keywords text for template injection
          const manuallySelectedChars = (book.characters || []).filter(c => suggestionSelectedCharIds.includes(c.id));
          
          const charDetailsText = manuallySelectedChars.length > 0 
              ? manuallySelectedChars.map(c => `Name: ${c.name}\nDescription: ${c.description}`).join('\n\n')
              : "No specific characters required.";
              
          const keywordsText = suggestionKeywords.trim() ? suggestionKeywords : "No specific keywords provided.";

          // Prepare Global Codex
          const globalCodexItems = book.codex.filter(item => item.isGlobal);
          const globalCodexText = globalCodexItems.length > 0 
              ? globalCodexItems.map(c => `[${c.title}]: ${c.content}`).join('\n\n') 
              : "No global world context.";

          // Inject variables into User Instruction Template
          // {storySoFar} is handled in parseTemplate, but we need to know if it was used to avoid duplicating context
          let instruction = suggestionConfig.instruction
              .replace('{count}', (suggestionConfig.count || 5).toString())
              .replace('{characters}', charDetailsText)
              .replace('{keywords}', keywordsText)
              .replace('{globalCodex}', globalCodexText);
              
          instruction = parseTemplate(instruction, book, activeChapter);

          // Prepare Context for Prompt
          const contextParts: string[] = [];

          // 1. Story So Far (Previous Chapter Summaries) - Only add if NOT in instruction
          const instructionIncludesStory = suggestionConfig.instruction.includes('{storySoFar}');
          
          if (!instructionIncludesStory) {
              const sortedChapters = [...book.chapters].sort((a, b) => a.order - b.order);
              const previousChapters = sortedChapters.filter(c => activeChapter && c.order < activeChapter.order);
              if (previousChapters.length > 0) {
                 const summaries = previousChapters
                    .filter(c => c.summary && c.summary.trim())
                    .map(c => `Chapter: ${c.title}\nSummary: ${c.summary}`)
                    .join('\n\n');
                 if (summaries) contextParts.push(`STORY SO FAR:\n${summaries}`);
              }
          }

          // 2. Current Chapter Content (Last ~1500 words / ~9000 chars)
          let contentToUse = overrideContent;
          if (contentToUse === undefined && activeChapter) {
              contentToUse = activeChapter.content;
          }
          
          if (contentToUse) {
              const content = contentToUse;
              const sliceLength = 9000;
              const slicedContent = content.length > sliceLength ? "..." + content.slice(-sliceLength) : content;
              contextParts.push(`CURRENT CHAPTER (Last ~1500 words):\n${slicedContent}`);
          }

          // Construct the full prompt
          const fullPrompt = `
CONTEXT:
${contextParts.join('\n\n')}

TASK:
${instruction}
`;
          
          const systemRole = suggestionConfig.systemRole;

          const config = getRuntimeConfig(suggestionConfig.provider, suggestionConfig.model, { 
              responseMimeType: 'application/json' 
          });

          const responseText = await LLMService.generateCompletion(fullPrompt, systemRole, config, [], ac.signal);

          // Attempt Parsing JSON
          let parsedData: any[] = [];
          const cleanText = responseText.trim();
          
          const jsonArrayMatch = cleanText.match(/\[[\s\S]*\]/);
          if (jsonArrayMatch) {
              try {
                  parsedData = JSON.parse(jsonArrayMatch[0]);
              } catch (e) {
                  // ignore failure
              }
          }

          if (!Array.isArray(parsedData) || parsedData.length === 0) {
               const summaryRegex = /"suggestionSummary"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
               const descRegex = /"suggestionDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
               
               const summaries: string[] = [];
               const descriptions: string[] = [];
               
               let match;
               while ((match = summaryRegex.exec(responseText)) !== null) {
                   summaries.push(match[1]);
               }
               while ((match = descRegex.exec(responseText)) !== null) {
                   descriptions.push(match[1]);
               }
               
               if (summaries.length > 0) {
                   parsedData = summaries.map((s, i) => {
                       try {
                           return {
                               suggestionSummary: JSON.parse(`"${s}"`),
                               suggestionDescription: descriptions[i] ? JSON.parse(`"${descriptions[i]}"`) : ""
                           };
                       } catch (e) {
                           return {
                               suggestionSummary: s,
                               suggestionDescription: descriptions[i] || ""
                           };
                       }
                   });
               }
          }

          if (!Array.isArray(parsedData) || parsedData.length === 0) {
               try {
                   const obj = JSON.parse(cleanText);
                   if (obj.suggestionSummary) {
                       parsedData = [obj];
                   }
               } catch (e) {
                   // ignore
               }
          }

          if (!Array.isArray(parsedData) || parsedData.length === 0) {
             throw new Error("Failed to parse suggestions from LLM response.");
          }

          // Process Suggestions to auto-detect characters
          const finalSuggestions: GeneratedSuggestion[] = parsedData.map((s: any) => {
              const textToCheck = `${s.suggestionSummary} ${s.suggestionDescription}`;
              
              // Start with manually selected characters
              const detectedChars = new Map<string, Character>();
              manuallySelectedChars.forEach(c => detectedChars.set(c.id, c));
              
              const autoDetected = detectCharacters(textToCheck);
              autoDetected.forEach(c => detectedChars.set(c.id, c));

              return {
                  id: crypto.randomUUID(),
                  suggestionSummary: s.suggestionSummary,
                  suggestionDescription: s.suggestionDescription,
                  characters: Array.from(detectedChars.values()),
                  isExpanded: false
              };
          });

          setGeneratedSuggestions(finalSuggestions);

      } catch (e: any) {
          if (e.name === 'AbortError') return;
          handleError(e);
      } finally {
          setIsGeneratingSuggestions(false);
          suggestionAbortController.current = null;
      }
  };

  const cancelSuggestions = () => {
      if (suggestionAbortController.current) {
          suggestionAbortController.current.abort();
          setIsGeneratingSuggestions(false);
      }
  };
  
  const startEditingSuggestion = (s: GeneratedSuggestion) => {
      setEditingSuggestionId(s.id);
      setEditingSuggestionText(s.suggestionDescription);
  };

  const saveSuggestionEdit = () => {
      setGeneratedSuggestions(prev => prev.map(s => {
          if (s.id === editingSuggestionId) {
               const detected = detectCharacters(editingSuggestionText);
               return { ...s, suggestionDescription: editingSuggestionText, characters: detected };
          }
          return s;
      }));
      setEditingSuggestionId(null);
      setEditingSuggestionText('');
  };

  const cancelSuggestionEdit = () => {
      setEditingSuggestionId(null);
      setEditingSuggestionText('');
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
    
    // Save to history
    onAddToHistory(activePrompt);
    
    // Find selected Prompt Kind
    const selectedKind = promptKinds.find(k => k.id === selectedKindId);
    if (!selectedKind) {
        alert("No prompt kind selected");
        return;
    }
    
    // Abort previous
    if (storyAbortController.current) {
        storyAbortController.current.abort();
    }
    const ac = new AbortController();
    storyAbortController.current = ac;

    setIsStoryGenerating(true);
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

    // 3. Prepare Prompt Parts
    // System Role (Persona)
    const systemRole = selectedKind.systemRole;
    
    // User Instruction (Task) - Parse Templates
    let userInstruction = selectedKind.instruction
        .replace('{Title}', book.title)
        .replace('{ChapterTitle}', activeChapter.title)
        .replace('{ChapterSummary}', activeChapter.summary);
    
    userInstruction = parseTemplate(userInstruction, book, activeChapter);

    const contextBlocks: string[] = [];

    // Inject Story So Far
    // Check if the instruction already included it (via parseTemplate)
    if (!selectedKind.instruction.includes('{storySoFar}')) {
        const sortedChapters = [...book.chapters].sort((a, b) => a.order - b.order);
        const previousChapters = sortedChapters.filter(c => c.order < activeChapter.order);
        const storySoFar = previousChapters
            .filter(c => c.summary && c.summary.trim())
            .map(c => `[${c.title}]: ${c.summary}`)
            .join('\n');
        
        if (storySoFar) {
            contextBlocks.push(`STORY SO FAR:\n${storySoFar}`);
        }
    }

    // Merge Codex and Characters
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
        contextBlocks.push(`IMPORTANT CONTEXT:\n${combinedContextItems.join('\n')}`);
    }

    // 4. Build Full Prompt (User Side)
    const fullPrompt = `
${contextBlocks.join('\n\n')}

Existing Content (Last 1500 chars): 
"${currentChapterContent.slice(-1500)}"

Instruction:
${userInstruction}

Input/Action:
${activePrompt}`;

    setLastDebugPrompt(fullPrompt);

    // 5. Construct Configuration
    const config = getRuntimeConfig(selectedKind.provider, selectedKind.model, {
        maxTokens: selectedKind.maxTokens || 2048,
        temperature: selectedKind.temperature ?? 0.7
    });

    try {
      // Pass systemRole as the System Instruction param
      const result = await LLMService.generateCompletion(
          fullPrompt, 
          systemRole, 
          config,
          [],
          ac.signal
      );
      
      const newContent = currentChapterContent + (currentChapterContent && result ? "\n\n" : "") + result;
      updateChapter(activeChapter.id, { content: newContent });
      
      const addedLength = result.length + (currentChapterContent && result ? 2 : 0);
      
      setLastAction({
          type: 'story_gen',
          prompt: activePrompt,
          responseLength: addedLength,
          kindId: selectedKindId
      });

      setPromptInput('');

      // Auto-generate suggestions if enabled
      if (autoGenerateSuggestions) {
        handleGenerateSuggestions(newContent);
      }

    } catch (error: any) {
      if (error.name === 'AbortError') return;
      handleError(error);
    } finally {
      setIsStoryGenerating(false);
      storyAbortController.current = null;
    }
  };

  const cancelStoryGeneration = () => {
      if (storyAbortController.current) {
          storyAbortController.current.abort();
          setIsStoryGenerating(false);
      }
  };

  const handleRetry = () => {
      if (!lastAction || lastAction.type !== 'story_gen' || !activeChapter) return;
      
      const currentContent = activeChapter.content;
      const cleanContent = currentContent.slice(0, -lastAction.responseLength);
      updateChapter(activeChapter.id, { content: cleanContent });
      
      setPromptInput(lastAction.prompt);
      generateStory(lastAction.prompt, cleanContent);
  };
  
  const handleRevert = () => {
      if (!lastAction) return;

      if (lastAction.type === 'story_gen' || lastAction.type === 'story_paste') {
          if (!activeChapter) return;
          const currentContent = activeChapter.content;
          const cleanContent = currentContent.slice(0, -lastAction.responseLength);
          updateChapter(activeChapter.id, { content: cleanContent });
          
          if (lastAction.type === 'story_gen') {
             setPromptInput(lastAction.prompt);
          }
          setLastAction(null);
      } else if (lastAction.type === 'suggestion_mod') {
          // This path is technically less reachable now for Rephrase/Expand as they trigger pastes
          // but kept for safety.
          setGeneratedSuggestions(prev => prev.map(s => {
              if (s.id === lastAction.suggestionId) {
                  // Revert description and re-run simple detection to ensure consistent state
                  const restoredDesc = lastAction.previousDescription;
                  // We'll just assume the characters from before were adequate or re-detect based on text
                  const detected = detectCharacters(restoredDesc);
                  return { ...s, suggestionDescription: restoredDesc, characters: detected };
              }
              return s;
          }));
          setLastAction(null);
      }
  };

  // --- Settings & Models Logic ---

  const handleFetchModelsForSettings = async () => {
      const config = providerConfigs[settingsSelectedProvider];
      setIsFetchingModels(true);
      setErrorState(null);
      try {
        const models = await LLMService.listModels(config);
        const updatedConfig = { ...config, availableModels: models };
        onUpdateSettings(brainstormConfig, summaryConfig, suggestionConfig, { ...providerConfigs, [settingsSelectedProvider]: updatedConfig });
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
      onUpdateSettings(brainstormConfig, summaryConfig, suggestionConfig, { ...providerConfigs, [provider]: updated });
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
    
    // Abort previous
    if (brainstormAbortController.current) {
        brainstormAbortController.current.abort();
    }
    const ac = new AbortController();
    brainstormAbortController.current = ac;

    const context = getBrainstormContext();
    // Prep User Instruction (Template)
    const userInstruction = parseTemplate(brainstormConfig.instruction, book, activeChapter);
    
    // Combine Context + Instruction + User Question
    const finalPrompt = `${userInstruction}\n\n${context ? `CONTEXT:\n${context}\n\n` : ''}USER QUESTION: ${brainstormInput}`;

    const userMsg: Message = { role: 'user', content: brainstormInput }; 
    const newHistory = [...brainstormMessages, userMsg];
    setBrainstormMessages(newHistory);
    setBrainstormInput('');
    setIsBrainstormGenerating(true);
    setErrorState(null);

    const config = getRuntimeConfig(brainstormConfig.provider, brainstormConfig.model);
    const systemRole = brainstormConfig.systemRole;

    try {
      const apiHistory = [...brainstormMessages, { role: 'user', content: finalPrompt }] as Message[];

      const result = await LLMService.generateCompletion(
          finalPrompt, // prompt argument
          systemRole, 
          config, 
          brainstormMessages,
          ac.signal
      );
      
      setBrainstormMessages([...newHistory, { role: 'model', content: result }]);
    } catch (e: any) {
       if (e.name === 'AbortError') return;
       handleError(e);
    } finally {
      setIsBrainstormGenerating(false);
      brainstormAbortController.current = null;
    }
  };

  const cancelBrainstorm = () => {
      if (brainstormAbortController.current) {
          brainstormAbortController.current.abort();
          setIsBrainstormGenerating(false);
      }
  };

  const handleBrainstormRetry = async () => {
    if (brainstormMessages.length < 2) return;
    const lastMsg = brainstormMessages[brainstormMessages.length - 1];
    if (lastMsg.role !== 'model') return;
    
    // Abort previous
    if (brainstormAbortController.current) {
        brainstormAbortController.current.abort();
    }
    const ac = new AbortController();
    brainstormAbortController.current = ac;

    const historyForUI = brainstormMessages.slice(0, -1);
    const userMsg = historyForUI[historyForUI.length - 1];
    
    if (!userMsg || userMsg.role !== 'user') return;
    
    const historyForAPI = historyForUI.slice(0, -1);
    
    setBrainstormMessages(historyForUI);

    const context = getBrainstormContext();
    const userInstruction = parseTemplate(brainstormConfig.instruction, book, activeChapter);
    const finalPrompt = `${userInstruction}\n\n${context ? `CONTEXT:\n${context}\n\n` : ''}USER QUESTION: ${userMsg.content}`;

    setIsBrainstormGenerating(true);
    setErrorState(null);
    const config = getRuntimeConfig(brainstormConfig.provider, brainstormConfig.model);
    const systemRole = brainstormConfig.systemRole;

    try {
      const result = await LLMService.generateCompletion(
          finalPrompt,
          systemRole,
          config,
          historyForAPI,
          ac.signal
      );
      setBrainstormMessages([...historyForUI, { role: 'model', content: result }]);
    } catch (e: any) {
       if (e.name === 'AbortError') return;
       handleError(e);
    } finally {
      setIsBrainstormGenerating(false);
      brainstormAbortController.current = null;
    }
  };

  // --- Suggestion Pasting & Typewriter Logic ---

  const typewriterAppend = (text: string) => {
    if (!activeChapter) return;
    
    const speed = suggestionConfig.typingSpeed ?? 50;
    const content = activeChapter.content;
    const initialSeparator = content ? "\n\n" : "";
    const addedLength = text.length + initialSeparator.length;

    // Clear any existing typing interval
    if (typingInterval.current) {
        clearInterval(typingInterval.current);
        setIsTyping(false);
    }

    // Instant paste if speed is 0 or very fast
    if (speed <= 0) {
        updateChapter(activeChapter.id, { content: content + initialSeparator + text });
        setLastAction({
            type: 'story_paste',
            responseLength: addedLength
        });
        // Clear suggestions after apply
        setGeneratedSuggestions([]);
        setSuggestionKeywords('');
        setSuggestionSelectedCharIds([]);
        return;
    }

    // Typewriter Effect
    setIsTyping(true);
    const words = text.split(/(\s+)/); // Split keeping separators
    let currentIndex = 0;
    let currentContent = content + initialSeparator;
    
    // Set last action immediately so undo works if they stop midway? 
    // Or set it at end? Better at end to have correct length.
    
    typingInterval.current = setInterval(() => {
        if (currentIndex >= words.length) {
            if (typingInterval.current) clearInterval(typingInterval.current);
            setIsTyping(false);
            
            // Final consistency save and set undo state
            updateChapter(activeChapter.id, { content: currentContent });
            setLastAction({
                type: 'story_paste',
                responseLength: addedLength
            });
            // Clear suggestions after apply
            setGeneratedSuggestions([]);
            setSuggestionKeywords('');
            setSuggestionSelectedCharIds([]);
            return;
        }

        currentContent += words[currentIndex];
        // We update the chapter on every 'word' which might trigger DB writes. 
        // For local IndexedDB this is usually acceptable at typing speeds (e.g. 50ms).
        updateChapter(activeChapter.id, { content: currentContent });
        currentIndex++;
    }, speed);
  };

  const handleApplySuggestion = (suggestion: GeneratedSuggestion) => {
      typewriterAppend(suggestion.suggestionDescription);
  };

  // Helper to compile context for Expand/Rephrase
  const getSuggestionContext = (chars: Character[]) => {
      const charText = chars.length > 0 
          ? chars.map(c => `Name: ${c.name}\nDescription: ${c.description}`).join('\n\n')
          : "No specific characters.";
      
      const globalCodexItems = book.codex.filter(item => item.isGlobal);
      const globalCodexText = globalCodexItems.length > 0 
          ? globalCodexItems.map(c => `[${c.title}]: ${c.content}`).join('\n\n') 
          : "No global world context.";

      return { charText, globalCodexText };
  }

  const handleRephraseSuggestion = async (suggestion: GeneratedSuggestion, e: React.MouseEvent) => {
      e.stopPropagation();
      setProcessingSuggestionId(suggestion.id);
      // const previousDesc = suggestion.suggestionDescription; // No longer storing for revert of card, as we paste directly
      
      try {
          // Detect characters in the *current* suggestion description to be up-to-date
          const currentChars = detectCharacters(suggestion.suggestionDescription);
          const { charText, globalCodexText } = getSuggestionContext(currentChars);
          
          let instruction = suggestionConfig.rephrase?.instruction || "Rewrite text: {text}";
          instruction = instruction
             .replace('{characters}', charText)
             .replace('{globalCodex}', globalCodexText)
             .replace('{text}', suggestion.suggestionDescription);
          
          instruction = parseTemplate(instruction, book, activeChapter);
          
          const systemRole = suggestionConfig.rephrase?.systemRole || "Rewrite text.";
          const config = getRuntimeConfig(suggestionConfig.provider, suggestionConfig.model);

          const result = await LLMService.generateCompletion(instruction, systemRole, config);
          
          // Update the card UI so the user sees the new version
          setGeneratedSuggestions(prev => prev.map(s => 
             s.id === suggestion.id ? { ...s, suggestionDescription: result, characters: currentChars } : s
          ));

          // Automatically add to editor with typewriter effect
          typewriterAppend(result);

      } catch (err) {
          handleError(err);
      } finally {
          setProcessingSuggestionId(null);
      }
  };

  const handleExpandSuggestion = async (suggestion: GeneratedSuggestion, e: React.MouseEvent) => {
      e.stopPropagation();
      setProcessingSuggestionId(suggestion.id);
      // const previousDesc = suggestion.suggestionDescription; 

      try {
          const currentChars = detectCharacters(suggestion.suggestionDescription);
          const { charText, globalCodexText } = getSuggestionContext(currentChars);
          
          let instruction = suggestionConfig.expand?.instruction || "Expand text: {text}";
          instruction = instruction
             .replace('{characters}', charText)
             .replace('{globalCodex}', globalCodexText)
             .replace('{text}', suggestion.suggestionDescription);
          
          instruction = parseTemplate(instruction, book, activeChapter);
          
          const systemRole = suggestionConfig.expand?.systemRole || "Expand text.";
          const config = getRuntimeConfig(suggestionConfig.provider, suggestionConfig.model);

          const result = await LLMService.generateCompletion(instruction, systemRole, config);
          
          // Update the card UI
          setGeneratedSuggestions(prev => prev.map(s => 
             s.id === suggestion.id ? { ...s, suggestionDescription: result, characters: currentChars } : s
          ));

          // Automatically add to editor with typewriter effect
          typewriterAppend(result);

      } catch (err) {
          handleError(err);
      } finally {
          setProcessingSuggestionId(null);
      }
  };

  const toggleSuggestionExpand = (id: string) => {
      setGeneratedSuggestions(prev => prev.map(s => 
          s.id === id ? { ...s, isExpanded: !s.isExpanded } : s
      ));
  };

  const toggleSuggestionCharSelect = (id: string) => {
      setSuggestionSelectedCharIds(prev => 
          prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
  };


  // Summary generation
  const handleGenerateSummaryInModal = async () => {
    const chapter = book.chapters.find(c => c.id === summaryModalChapterId);
    if (!chapter || !chapter.content) return;
    setIsGeneratingSummary(true);
    setErrorState(null);
    
    const config = getRuntimeConfig(summaryConfig.provider, summaryConfig.model);
    
    const parsedInstruction = parseTemplate(summaryConfig.instruction, book, chapter);
    const systemRole = summaryConfig.systemRole;

    try {
      const prompt = `${parsedInstruction}\n\nContent to summarize:\n${chapter.content}`;

      const result = await LLMService.generateCompletion(
        prompt, 
        systemRole, 
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
  
  // Prepare content for rendering with highlight
  const getContentParts = () => {
      if (!activeChapter) return { normal: '', highlight: '' };
      
      const content = activeChapter.content;
      if (lastAction && (lastAction.type === 'story_gen' || lastAction.type === 'story_paste')) {
          const len = lastAction.responseLength;
          if (content.length >= len) {
              return {
                  normal: content.slice(0, content.length - len),
                  highlight: content.slice(content.length - len)
              };
          }
      }
      return { normal: content, highlight: '' };
  };
  
  const { normal: normalContent, highlight: highlightContent } = getContentParts();

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
        <div className="flex items-center gap-4">
            <div className="text-xs text-slate-500 hidden sm:flex items-center gap-2">
                Brainstorming: <span className="text-indigo-400 font-semibold uppercase">{brainstormConfig.provider}</span>
            </div>
            <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white" title="Settings">
                <Settings size={20} />
            </button>
            <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className={`p-2 hover:bg-slate-800 rounded-full transition-colors ${!isRightPanelOpen ? 'text-indigo-400' : 'text-slate-400'}`} title="Toggle Right Sidebar">
               <PanelRight size={20} />
            </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL */}
        <div className={`flex flex-col bg-slate-925 shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${isLeftPanelOpen ? 'w-96 border-r border-slate-800' : 'w-0 border-r-0'}`}>
          <div className="flex border-b border-slate-800">
            <button onClick={() => setLeftTab('chapters')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${leftTab === 'chapters' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`} title="Chapters"><BookOpen size={16} /></button>
            <button onClick={() => setLeftTab('brainstorm')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${leftTab === 'brainstorm' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`} title="Brainstorm"><MessageSquare size={16} /></button>
            <button onClick={() => setLeftTab('suggestions')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${leftTab === 'suggestions' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`} title="Suggestions"><Lightbulb size={16} /></button>
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
                        {isBrainstormGenerating ? (
                             <button onClick={cancelBrainstorm} className="h-8 w-8 rounded flex items-center justify-center transition-colors bg-red-600 hover:bg-red-500 text-white" title="Stop"><Square size={12} fill="currentColor" /></button>
                        ) : (
                             <button onClick={handleBrainstorm} className="h-8 w-8 rounded flex items-center justify-center transition-colors bg-indigo-600 hover:bg-indigo-500 text-white"><Send size={14} /></button>
                        )}
                        {brainstormMessages.length > 0 && brainstormMessages[brainstormMessages.length - 1].role === 'model' && !isBrainstormGenerating && (
                            <button onClick={handleBrainstormRetry} className="h-6 w-8 flex items-center justify-center text-orange-400 hover:bg-slate-900 rounded" title="Retry"><RotateCcw size={12} /></button>
                        )}
                    </div>
                </div>
              </div>
            )}

            {leftTab === 'suggestions' && (
                <div className="flex flex-col h-full">
                    {/* Suggestions List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 mb-2 p-1">
                        {generatedSuggestions.length === 0 && (
                             <div className="text-center text-slate-500 text-xs mt-10 px-4">
                                {isGeneratingSuggestions ? 'Generating suggestions...' : 'No suggestions yet. Use the builder below to generate plot ideas.'}
                             </div>
                        )}
                        {generatedSuggestions.map(s => (
                            <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden group relative">
                                {processingSuggestionId === s.id && (
                                    <div className="absolute inset-0 bg-slate-950/60 z-10 flex items-center justify-center">
                                        <RefreshCw size={24} className="animate-spin text-indigo-400"/>
                                    </div>
                                )}
                                <div className="p-3 cursor-pointer hover:bg-slate-800/50 transition-colors" onClick={() => toggleSuggestionExpand(s.id)}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="text-sm font-medium text-slate-200">{s.suggestionSummary}</div>
                                        <div className="text-slate-500">{s.isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</div>
                                    </div>
                                    {s.characters.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {s.characters.map(c => (
                                                 <span key={c.id} className="text-[10px] px-1.5 py-0.5 bg-indigo-900/30 text-indigo-300 rounded-full border border-indigo-500/20">{c.name}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {s.isExpanded && (
                                    <div className="px-3 pb-3 pt-1 border-t border-slate-800/50 bg-slate-950/30">
                                        {editingSuggestionId === s.id ? (
                                            <div className="mb-3 animate-in fade-in zoom-in-95 duration-200">
                                                <textarea 
                                                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-indigo-500 min-h-[100px] custom-scrollbar"
                                                    value={editingSuggestionText}
                                                    onChange={(e) => setEditingSuggestionText(e.target.value)}
                                                    autoFocus
                                                    placeholder="Edit suggestion..."
                                                />
                                                <div className="flex gap-2 mt-2 justify-end">
                                                     <button onClick={cancelSuggestionEdit} className="text-xs px-3 py-1 bg-slate-800 text-slate-400 border border-slate-700 hover:text-white rounded transition-colors">Cancel</button>
                                                     <button onClick={saveSuggestionEdit} className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors">Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative group/desc mb-3">
                                                 <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap pr-4 cursor-text hover:text-slate-300 transition-colors" onClick={() => startEditingSuggestion(s)} title="Click to edit">{s.suggestionDescription}</p>
                                                 <button 
                                                    onClick={(e) => { e.stopPropagation(); startEditingSuggestion(s); }} 
                                                    className="absolute top-0 right-0 p-1 text-slate-600 hover:text-indigo-400 opacity-0 group-hover/desc:opacity-100 transition-opacity"
                                                    title="Edit Description"
                                                >
                                                    <Edit2 size={12}/>
                                                </button>
                                            </div>
                                        )}
                                        
                                        {editingSuggestionId !== s.id && (
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleApplySuggestion(s)}
                                                    disabled={isTyping}
                                                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Check size={12} /> Apply
                                                </button>
                                                <button 
                                                    onClick={(e) => handleRephraseSuggestion(s, e)}
                                                    disabled={isTyping}
                                                    className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-orange-400 text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Rephrase & Apply"
                                                >
                                                    <RefreshCw size={12} /> Rephrase
                                                </button>
                                                <button 
                                                    onClick={(e) => handleExpandSuggestion(s, e)}
                                                    disabled={isTyping}
                                                    className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-green-400 text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Expand & Apply"
                                                >
                                                    <Maximize2 size={12} /> Expand
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Suggestion Builder */}
                    <div className="bg-slate-900 rounded-lg border border-slate-800 p-3 shrink-0 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <div className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Sparkles size={12}/> Suggestion Builder</div>
                            {/* Auto Toggle */}
                            <label className="flex items-center gap-2 cursor-pointer group" title="Automatically generate new ideas after writing">
                                 <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-300 transition-colors">Auto-Gen</span>
                                 <div className="relative w-8 h-4 bg-slate-800 rounded-full border border-slate-700 transition-colors group-hover:border-slate-600">
                                      <input type="checkbox" className="peer sr-only" checked={autoGenerateSuggestions} onChange={(e) => setAutoGenerateSuggestions(e.target.checked)}/>
                                      <div className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-slate-500 rounded-full transition-all ${autoGenerateSuggestions ? 'translate-x-4 bg-indigo-400' : ''}`}></div>
                                 </div>
                            </label>
                        </div>
                        
                        {/* Mode Selector */}
                        <div>
                            <select 
                                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs outline-none focus:border-indigo-500 text-slate-300 font-medium"
                                value={suggestionConfig.activeModeId || suggestionModes[0]?.id || ''}
                                onChange={(e) => handleModeChange(e.target.value)}
                            >
                                {suggestionModes.map(mode => (
                                    <option key={mode.id} value={mode.id}>{mode.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Character Selector */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-slate-500">Includes Characters</label>
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar bg-slate-950 border border-slate-800 rounded p-2">
                                {book.characters.length === 0 && <div className="text-[10px] text-slate-600 italic">No characters available.</div>}
                                {(book.characters || []).map(c => {
                                    const isSelected = suggestionSelectedCharIds.includes(c.id);
                                    return (
                                        <button 
                                            key={c.id} 
                                            onClick={() => toggleSuggestionCharSelect(c.id)}
                                            className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                                                isSelected 
                                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm shadow-indigo-500/20' 
                                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-300'
                                            }`}
                                        >
                                            {c.name}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Keywords */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-slate-500">Keywords & Instructions</label>
                            <textarea 
                                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs outline-none focus:border-indigo-500 resize-none h-16 custom-scrollbar placeholder-slate-600"
                                placeholder="e.g. Plot twist, sudden arrival, mystery revealed..."
                                value={suggestionKeywords}
                                onChange={(e) => setSuggestionKeywords(e.target.value)}
                            />
                        </div>

                        {/* Generate Button */}
                        {isGeneratingSuggestions ? (
                             <button 
                                onClick={cancelSuggestions}
                                className="w-full py-2 rounded text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white"
                             >
                                 <Square size={14} fill="currentColor" /> Cancel
                             </button>
                        ) : (
                             <button 
                                onClick={() => handleGenerateSuggestions()}
                                className="w-full py-2 rounded text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
                             >
                                 <Sparkles size={14} /> Generate Ideas
                             </button>
                        )}
                    </div>
                </div>
            )}

          </div>
        </div>

        {/* CENTER PANEL */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
          {activeChapter ? (
            <>
              {/* Editor Section */}
              <div className="flex-1 flex flex-col min-h-0 relative">
                 {/* Header */}
                <div className="flex items-center justify-between px-6 py-2 bg-slate-900 border-b border-slate-800 shrink-0 z-10">
                  <div className="flex items-center gap-4">
                      <h3 className="text-sm font-bold text-slate-300 tracking-wide uppercase">{activeChapter.title}</h3>
                      <div className="h-4 w-px bg-slate-700/50" />
                      <div className="flex gap-3 text-xs text-slate-500 font-mono">
                          <span>{activeChapter.content.length} chars</span>
                          <span>{activeChapter.content.trim().split(/\s+/).filter(Boolean).length} words</span>
                      </div>
                  </div>
                </div>
                
                {/* Writing Area */}
                <div 
                    className="flex-1 overflow-y-auto custom-scrollbar flex justify-center bg-slate-950 cursor-text"
                    onClick={() => textareaRef.current?.focus()}
                >
                    <div className="w-full max-w-3xl px-8 py-12 min-h-full relative">
                        {/* Highlight Overlay */}
                        <div 
                            className="absolute inset-0 px-8 py-12 font-serif text-lg leading-loose whitespace-pre-wrap break-words pointer-events-none z-0 text-transparent select-none"
                            aria-hidden="true"
                        >
                            {normalContent}
                            <span className="bg-indigo-500/20 text-transparent rounded decoration-clone">{highlightContent}</span>
                        </div>
                        
                        {/* Actual Editor */}
                        <textarea 
                            id="chapter-editor-textarea"
                            ref={textareaRef}
                            className="relative z-10 w-full bg-transparent resize-none outline-none text-lg leading-loose font-serif text-slate-300 placeholder-slate-700 overflow-hidden" 
                            style={{ minHeight: '100%' }}
                            placeholder="Start writing..." 
                            value={activeChapter.content} 
                            onChange={(e) => {
                                updateChapter(activeChapter.id, { content: e.target.value });
                                // Clear highlight/last action on user manual input
                                setLastAction(null);
                            }}
                            readOnly={isTyping}
                            spellCheck={false}
                        />
                    </div>
                </div>
              </div>

              {/* Controls/Prompt Section */}
              <div className="h-[25%] min-h-[200px] border-t border-slate-800 bg-slate-900 flex flex-col shadow-2xl z-20">
                 <div className="max-w-4xl w-full mx-auto h-full p-4 flex flex-col">
                     <div className="flex items-center gap-3 mb-2 shrink-0">
                        <Sparkles size={16} className="text-indigo-400" />
                        <div className="relative flex items-center gap-1">
                            <select value={selectedKindId} onChange={(e) => setSelectedKindId(e.target.value)} className="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500 appearance-none pr-8 min-w-[150px]">
                                {promptKinds.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                            <div className="absolute right-2 pointer-events-none text-slate-500"><MoreHorizontal size={12} /></div>
                        </div>
                        <button onClick={() => openEditPromptKindModal(selectedKindId)} className="p-1 text-slate-500 hover:text-indigo-400" title="Edit Prompt Settings"><Edit2 size={14} /></button>
                         <button onClick={openNewPromptKindModal} className="p-1 text-slate-500 hover:text-indigo-400" title="New Prompt Kind"><Plus size={14} /></button>
                        
                        {/* History Button */}
                         <div className="relative" ref={historyDropdownRef}>
                             <button onClick={() => setIsHistoryOpen(!isHistoryOpen)} className="p-1 text-slate-500 hover:text-indigo-400" title="Prompt History">
                                 <Clock size={14} />
                             </button>
                             {isHistoryOpen && (
                                 <div className="absolute top-full left-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 flex flex-col max-h-64">
                                     <div className="p-2 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase">Recent Prompts</div>
                                     <div className="overflow-y-auto flex-1 custom-scrollbar">
                                         {promptHistory.length === 0 ? (
                                             <div className="p-4 text-xs text-slate-600 text-center italic">No history yet.</div>
                                         ) : (
                                             promptHistory.map((h, i) => (
                                                 <button 
                                                    key={i} 
                                                    onClick={() => { setPromptInput(h); setIsHistoryOpen(false); }}
                                                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 border-b border-slate-800/50 last:border-0 truncate"
                                                 >
                                                     {h}
                                                 </button>
                                             ))
                                         )}
                                     </div>
                                 </div>
                             )}
                         </div>

                        {/* View Full Prompt Button */}
                        {lastDebugPrompt && (
                             <button onClick={() => setIsFullPromptModalOpen(true)} className="p-1 text-slate-500 hover:text-indigo-400" title="View Full Sent Prompt">
                                 <Eye size={14} />
                             </button>
                        )}

                        <div className="flex-1" />
                        {isStoryGenerating && <span className="text-xs text-indigo-400 animate-pulse">Writing...</span>}
                        {isTyping && <span className="text-xs text-indigo-400 animate-pulse">Typing...</span>}
                     </div>
                     <div className="flex gap-2 flex-1 min-h-0">
                        <textarea className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 resize-none text-sm outline-none focus:border-indigo-500/50 transition-colors" placeholder="Prompt instruction..." value={promptInput} onChange={(e) => setPromptInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateStory(); }}}/>
                        <div className="flex flex-col gap-2 items-center">
                            {isStoryGenerating ? (
                                 <button onClick={cancelStoryGeneration} className="h-10 w-12 rounded-lg flex items-center justify-center transition-colors bg-red-600 hover:bg-red-500 text-white" title="Stop"><Square size={20} fill="currentColor" /></button>
                            ) : (
                                 <button onClick={() => generateStory()} disabled={isTyping} className="h-10 w-12 rounded-lg flex items-center justify-center transition-colors bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"><Send size={20} /></button>
                            )}
                            {lastAction && !isStoryGenerating && !isTyping && (
                                <div className="flex gap-1">
                                    <button onClick={handleRevert} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-indigo-400 transition-colors" title="Undo Last Action"><Undo2 size={14} /></button>
                                    {lastAction.type === 'story_gen' && (
                                        <button onClick={handleRetry} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-orange-400 transition-colors" title="Retry Generation"><RotateCcw size={14} /></button>
                                    )}
                                </div>
                            )}
                        </div>
                     </div>
                 </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-600">
                <div className="text-center">
                    <BookOpen size={48} className="mx-auto mb-4 opacity-20"/>
                    <p>Select or create a chapter to start writing.</p>
                </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Codex & Characters */}
        <div className={`flex flex-col bg-slate-925 shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${isRightPanelOpen ? 'w-80 border-l border-slate-800' : 'w-0 border-l-0'}`}>
             <div className="flex border-b border-slate-800">
                <button onClick={() => setRightTab('characters')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${rightTab === 'characters' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`} title="Characters"><Users size={16} /> Characters</button>
                <button onClick={() => setRightTab('codex')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${rightTab === 'codex' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'}`} title="Codex"><BookOpen size={16} /> Codex</button>
             </div>

             <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {rightTab === 'codex' && (
                    <div className="space-y-4">
                        <button 
                            onClick={openNewCodexModal}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors mb-2"
                        >
                            <Plus size={16} /> Add Codex Entry
                        </button>

                        <div className="space-y-3">
                            {book.codex.map(item => (
                                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 group hover:border-indigo-500/30 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-sm text-indigo-300 flex items-center gap-2">{item.title}{item.isGlobal && <span title="Global Entry"><Globe size={12} className="text-green-400" /></span>}</span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => openEditCodexModal(item)} className="p-1 hover:text-white text-slate-500"><Edit2 size={12} /></button><button onClick={() => deleteCodex(item.id)} className="p-1 hover:text-red-400 text-slate-500"><Trash2 size={12} /></button></div>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mb-2">{item.tags.map(t => (<span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-full">{t}</span>))}</div>
                                    <p className="text-xs text-slate-400 line-clamp-3">{item.content}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {rightTab === 'characters' && (
                    <div className="space-y-4">
                        <button 
                            onClick={openNewCharacterModal}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors mb-2"
                        >
                            <Plus size={16} /> Add Character
                        </button>

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
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => openEditCharacterModal(char)} className="p-1 hover:text-white text-slate-500"><Edit2 size={12} /></button><button onClick={() => deleteCharacter(char.id)} className="p-1 hover:text-red-400 text-slate-500"><Trash2 size={12} /></button></div>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mb-2">{char.aliases.map(t => (<span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-full">{t}</span>))}</div>
                                        <p className="text-xs text-slate-400 line-clamp-2">{char.description}</p>
                                    </div>
                                </div>
                            ))}
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

      {/* Full Prompt Viewer Modal */}
      {isFullPromptModalOpen && lastDebugPrompt && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsFullPromptModalOpen(false)}>
               <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[800px] max-w-[90vw] flex flex-col overflow-hidden max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
                   <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-850">
                       <h3 className="font-bold text-slate-200 flex items-center gap-2"><Eye size={18} className="text-indigo-400"/> Full Sent Prompt</h3>
                       <button onClick={() => setIsFullPromptModalOpen(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                   </div>
                   <div className="flex-1 p-0 overflow-hidden">
                       <textarea 
                          readOnly 
                          className="w-full h-full bg-slate-950 p-4 text-xs font-mono text-slate-300 outline-none resize-none"
                          value={lastDebugPrompt} 
                        />
                   </div>
                   <div className="p-3 border-t border-slate-800 bg-slate-850 flex justify-end">
                       <button onClick={() => setIsFullPromptModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Close</button>
                   </div>
               </div>
           </div>
      )}

      {/* Settings Modal */}
      {isSettingsModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsSettingsModalOpen(false)}>
               <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[900px] h-[700px] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-850 shrink-0">
                       <h3 className="font-bold text-slate-200 flex items-center gap-2"><Settings size={18} className="text-indigo-400"/> Settings</h3>
                       <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                   </div>
                   
                   {/* Settings Tabs */}
                   <div className="flex bg-slate-900 border-b border-slate-800 shrink-0 overflow-x-auto">
                        <button onClick={() => setSettingsTab('general')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${settingsTab === 'general' ? 'border-indigo-500 text-indigo-400 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}>General</button>
                        <button onClick={() => setSettingsTab('providers')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${settingsTab === 'providers' ? 'border-indigo-500 text-indigo-400 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}>Providers</button>
                        <button onClick={() => setSettingsTab('brainstorm')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${settingsTab === 'brainstorm' ? 'border-indigo-500 text-indigo-400 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}>Brainstorm</button>
                        <button onClick={() => setSettingsTab('suggestions')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${settingsTab === 'suggestions' ? 'border-indigo-500 text-indigo-400 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}>Suggestions</button>
                        <button onClick={() => setSettingsTab('summary')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${settingsTab === 'summary' ? 'border-indigo-500 text-indigo-400 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}>Summary</button>
                   </div>

                   <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scrollbar bg-slate-925">
                         {/* Book Configuration Section */}
                        {settingsTab === 'general' && (
                            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <h4 className="text-xs font-bold text-indigo-400 uppercase mb-4 border-b border-slate-800 pb-2 flex items-center gap-2"><BookOpen size={14}/> Book Configuration</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Point of View (POV)</label>
                                        <div className="relative">
                                            <select 
                                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 appearance-none"
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
                                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 appearance-none"
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
                        )}

                        {/* Global Provider Configuration */}
                        {settingsTab === 'providers' && (
                            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 border-b border-slate-800 pb-2">Global Provider Configuration</h4>
                                
                                <div className="flex bg-slate-900 rounded p-1 mb-4">
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
                                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500"
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
                                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500"
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
                                        <div className="bg-slate-900 border border-slate-800 rounded h-32 overflow-y-auto p-2 custom-scrollbar">
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
                        )}

                        {/* Brainstorming Configuration Section */}
                        {settingsTab === 'brainstorm' && (
                            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <h4 className="text-xs font-bold text-indigo-400 uppercase mb-4 border-b border-slate-800 pb-2 flex items-center gap-2"><MessageSquare size={14}/> Brainstorming Config</h4>
                                
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Provider</label>
                                        <select 
                                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm outline-none focus:border-indigo-500 capitalize"
                                            value={brainstormConfig.provider}
                                            onChange={(e) => onUpdateSettings({...brainstormConfig, provider: e.target.value as LLMProvider}, summaryConfig, suggestionConfig, providerConfigs)}
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
                                            onChange={(val) => onUpdateSettings({...brainstormConfig, model: val}, summaryConfig, suggestionConfig, providerConfigs)}
                                            placeholder="Select Model"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">System Role (Persona)</label>
                                        <textarea 
                                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm h-24 resize-none outline-none focus:border-indigo-500 leading-relaxed custom-scrollbar"
                                            value={brainstormConfig.systemRole}
                                            onChange={(e) => onUpdateSettings({...brainstormConfig, systemRole: e.target.value}, summaryConfig, suggestionConfig, providerConfigs)}
                                            placeholder="You are a creative writing assistant..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Instruction Template</label>
                                        <textarea 
                                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm h-32 resize-none outline-none focus:border-indigo-500 leading-relaxed custom-scrollbar"
                                            value={brainstormConfig.instruction}
                                            onChange={(e) => onUpdateSettings({...brainstormConfig, instruction: e.target.value}, summaryConfig, suggestionConfig