
import React, { useRef, useState } from 'react';
import { Book } from '../types';
import { Plus, MoreVertical, Trash2, Edit2, Image as ImageIcon, Download } from 'lucide-react';

interface LibraryProps {
  books: Book[];
  onOpenBook: (id: string) => void;
  onCreateBook: () => void;
  onUpdateBook: (id: string, updates: Partial<Book>) => void;
  onDeleteBook: (id: string) => void;
}

export const Library: React.FC<LibraryProps> = ({ 
  books, 
  onOpenBook, 
  onCreateBook, 
  onUpdateBook, 
  onDeleteBook 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const handleImageUpload = (bookId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onUpdateBook(bookId, { coverImage: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelect = (bookId: string) => {
    const input = document.getElementById(`file-input-${bookId}`) as HTMLInputElement;
    input?.click();
  };

  const handleExportBook = (book: Book) => {
    const sortedChapters = [...book.chapters].sort((a, b) => a.order - b.order);
    
    // Simple HTML escaper
    const escapeHtml = (text: string) => {
      const div = document.createElement('div');
      div.innerText = text || '';
      return div.innerHTML;
    };

    let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(book.title)}</title>
    <style>
        body { font-family: 'Times New Roman', serif; line-height: 1.8; max-width: 800px; margin: 0 auto; padding: 4rem 2rem; background-color: #ffffff; color: #2d3748; }
        h1 { text-align: center; font-size: 3rem; margin-bottom: 4rem; border-bottom: 2px solid #cbd5e0; padding-bottom: 2rem; }
        .chapter { margin-bottom: 6rem; page-break-after: always; }
        .chapter-header { text-align: center; margin-bottom: 3rem; }
        .chapter-number { font-size: 1.5rem; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; color: #4a5568; margin-bottom: 0.5rem; }
        .chapter-content { white-space: pre-wrap; text-align: justify; font-size: 1.2rem; }
    </style>
</head>
<body>
    <h1>${escapeHtml(book.title)}</h1>
`;

    sortedChapters.forEach((chapter, index) => {
        htmlContent += `
    <div class="chapter">
        <div class="chapter-header">
            <div class="chapter-number">Chapter ${index + 1}</div>
        </div>
        <div class="chapter-content">${escapeHtml(chapter.content)}</div>
    </div>
`;
    });

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-100">Library</h1>
            <p className="text-slate-400 mt-2">Select a book to continue writing or start a new adventure.</p>
          </div>
          <button 
            onClick={onCreateBook}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={20} />
            <span>New Book</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {books.map((book) => (
            <div key={book.id} className="group relative bg-slate-900 rounded-xl border border-slate-800 overflow-hidden hover:border-indigo-500/50 transition-all shadow-lg hover:shadow-indigo-500/10">
              
              {/* Cover Image Area */}
              <div 
                className="h-48 bg-slate-800 w-full relative cursor-pointer overflow-hidden"
                onClick={() => onOpenBook(book.id)}
              >
                {book.coverImage ? (
                  <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <span className="text-6xl font-serif opacity-20">Aa</span>
                  </div>
                )}
                
                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

                {/* Menu Button - Top Right */}
                <div className="absolute top-2 right-2 z-20">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === book.id ? null : book.id);
                      }}
                      className={`p-2 rounded-full transition-all duration-200 ${
                        menuOpenId === book.id 
                          ? 'bg-slate-800 text-white shadow-lg' 
                          : 'bg-black/40 text-white/80 hover:bg-slate-800 hover:text-white opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <MoreVertical size={16} />
                    </button>

                    {menuOpenId === book.id && (
                      <div 
                        className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button 
                          onClick={() => {
                            setEditingId(book.id);
                            setEditTitle(book.title);
                            setMenuOpenId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                        >
                          <Edit2 size={14} /> Rename
                        </button>
                        <button 
                          onClick={() => triggerFileSelect(book.id)}
                          className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                        >
                          <ImageIcon size={14} /> Change Cover
                        </button>
                         <input 
                            type="file" 
                            id={`file-input-${book.id}`}
                            accept="image/*"
                            className="hidden" 
                            onChange={(e) => handleImageUpload(book.id, e)} 
                        />
                        <button 
                          onClick={() => {
                            handleExportBook(book);
                            setMenuOpenId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                        >
                          <Download size={14} /> Export HTML
                        </button>
                        <div className="h-px bg-slate-700 my-1" />
                        <button 
                          onClick={() => onDeleteBook(book.id)}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex justify-between items-start">
                  {editingId === book.id ? (
                    <input 
                      type="text" 
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => {
                        if (editTitle.trim()) onUpdateBook(book.id, { title: editTitle });
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            if (editTitle.trim()) onUpdateBook(book.id, { title: editTitle });
                            setEditingId(null);
                        }
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      className="bg-slate-800 text-slate-100 px-2 py-1 rounded w-full outline-none border border-indigo-500"
                    />
                  ) : (
                    <h3 
                        className="font-bold text-lg text-slate-100 truncate cursor-pointer hover:text-indigo-400 w-full"
                        onClick={() => onOpenBook(book.id)}
                    >
                        {book.title}
                    </h3>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                   {book.chapters.length} Chapters • {new Date(book.lastModified).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Backdrop for closing menus */}
      {menuOpenId && (
        <div className="fixed inset-0 z-10 bg-transparent" onClick={() => setMenuOpenId(null)} />
      )}
    </div>
  );
};
