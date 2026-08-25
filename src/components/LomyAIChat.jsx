import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { Send, X, Loader2, Menu, Plus, Trash2, Bookmark, ChevronRight, ChefHat, Utensils, Clock, Check, ChevronDown } from 'lucide-react';
import { streamLomyChat, buildAiRecipe } from '../utils/aiFood';
import { makeEntry } from '../utils/foodLog';
import renderMiniMarkdown from '../utils/renderMiniMarkdown';
import { db } from '../firebase';
import useWakeLock from '../hooks/useWakeLock';
import { EMPTY_NUTRITION, NUTRIENTS } from '../data/nutrition';
import { getLocalYMD, getMonthKey } from '../data/constants';

const THINKING_PHASES = [
  'Membaca riwayat makananmu...',
  'Menganalisis nutrisi & target harian...',
  'Menyusun rekomendasi gizi terbaik...'
];

const FAQ_ITEMS = [
  { q: 'Menu makan malam tinggi protein yang simpel?', prompt: 'Rekomendasikan resep makan malam tinggi protein yang simpel dan bergizi seimbang untuk malam ini.' },
  { q: 'Evaluasi pola makan & asupan seminggu terakhir', prompt: 'Tolong evaluasi pola makanku selama seminggu terakhir berdasarkan riwayat yang tercatat.' },
  { q: 'Kapan waktu terbaik minum kafein & kreatin?', prompt: 'Kapan waktu paling optimal untuk mengonsumsi kafein dan kreatin sebelum/sesudah aktivitas atau latihan?' },
  { q: 'Ide olahan dari stok bahan dapurku', prompt: 'Berdasarkan bahan makanan yang ada di dapurku (Domus), ada ide resep apa yang sehat dan praktis?' },
  { q: 'Bagaimana cara latihan beban yang efektif?', prompt: 'Bagaimana tips memulai latihan beban di gym untuk membentuk otot dan bakar lemak?' },
];

const shiftYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return getLocalYMD(new Date(y, m - 1, d + days));
};

const asList = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((s) => (s == null ? '' : String(s).trim()))
    .filter(Boolean);

export default function LomyAIChat({
  isOpen,
  onClose,
  user,
  logymUser,
  profile,
  daysMap,
  ensureMonth,
  todayYmd = getLocalYMD(),
  domusItems = [],
  aiKey,
  onUnreadChange,
  avatarOrigin = null,
  recipes = [],
  saveRecipesFn,
  saveDay,
  showToast,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingPhaseIdx, setThinkingPhaseIdx] = useState(0);
  const [savedRecipeKeys, setSavedRecipeKeys] = useState(new Set());
  const [savedFoodLogKeys, setSavedFoodLogKeys] = useState(new Set());
  const [expandedRecipes, setExpandedRecipes] = useState(new Set());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  const wakeLock = useWakeLock();

  useEffect(() => {
    if (isLoading) {
      wakeLock.request();
    } else {
      wakeLock.release();
    }
  }, [isLoading, wakeLock]);

  // Phase state machine for opening & closing spring scale animations
  const [phase, setPhase] = useState('closed');
  const phaseTimer = useRef(null);

  useEffect(() => {
    clearTimeout(phaseTimer.current);
    if (isOpen) {
      setPhase('opening');
      phaseTimer.current = setTimeout(() => {
        setPhase('open');
        setTimeout(() => scrollToBottom('auto'), 50);
      }, 20);
    } else {
      setPhase('closing');
      phaseTimer.current = setTimeout(() => setPhase('closed'), 360);
    }
    return () => clearTimeout(phaseTimer.current);
  }, [isOpen]);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);

  // Persona & Memory
  const [lomyPersona] = useState(() => localStorage.getItem('lomeal_lomy_persona') || 'santai');
  const [lomyCustomInstruction] = useState(() => localStorage.getItem('lomeal_lomy_custom_instruction') || '');
  const [lomyMemory, setLomyMemory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lomeal_lomy_memory')) || []; } catch { return []; }
  });

  const lastSavedSessionsRef = useRef({});

  // Pastikan data 7 hari terakhir dimuat
  useEffect(() => {
    if (!isOpen || !ensureMonth) return;
    new Set([0, 6].map((i) => getMonthKey(shiftYmd(todayYmd, -i)))).forEach(ensureMonth);
  }, [isOpen, ensureMonth, todayYmd]);

  // Load Sesi Chat dari Firestore / LocalStorage
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      const saved = localStorage.getItem('lomeal_ai_sessions_guest');
      let loaded = [];
      if (saved) { try { loaded = JSON.parse(saved); } catch (e) {} }
      lastSavedSessionsRef.current = {};
      setSessions(loaded);
      setActiveSessionId(loaded.length > 0 ? loaded[0].id : null);
      setMessages(loaded.length > 0 ? loaded[0].messages : []);
      return;
    }

    const sessionsKey = `lomeal_ai_sessions_${uid}`;
    let cancelled = false;

    (async () => {
      let loadedSessions = [];
      try {
        const snap = await getDocs(collection(db, 'lomeal_users', uid, 'ai_sessions'));
        loadedSessions = snap.docs.map(d => d.data());
      } catch (err) {
        console.warn('Gagal memuat sesi chat Lomy dari cloud, pakai cache lokal:', err);
      }
      if (cancelled) return;

      if (loadedSessions.length === 0) {
        const savedSessions = localStorage.getItem(sessionsKey);
        if (savedSessions) {
          try { loadedSessions = JSON.parse(savedSessions); } catch (e) {}
        }
        if (loadedSessions.length === 0) {
          const oldChat = localStorage.getItem('lomeal_lomy_chat');
          if (oldChat) {
            try {
              const oldMessages = JSON.parse(oldChat);
              if (oldMessages && oldMessages.length > 0) {
                loadedSessions = [{ id: 'migrated-session', title: 'Obrolan Sebelumnya', messages: oldMessages.map(m => ({ role: m.role, content: m.text || m.content, timestamp: Date.now() })), updatedAt: Date.now() }];
                localStorage.removeItem('lomeal_lomy_chat');
              }
            } catch (e) {}
          }
        }
        loadedSessions.forEach(s => {
          setDoc(doc(db, 'lomeal_users', uid, 'ai_sessions', s.id), s).catch(err => console.warn('Migrasi sesi chat Lomy gagal:', err));
        });
      }

      const baseline = {};
      loadedSessions.forEach(s => { baseline[s.id] = JSON.stringify(s); });
      lastSavedSessionsRef.current = baseline;

      setSessions(loadedSessions);
      if (loadedSessions.length > 0) localStorage.setItem(sessionsKey, JSON.stringify(loadedSessions));
      setActiveSessionId(loadedSessions.length > 0 ? loadedSessions[0].id : null);
      setMessages(loadedSessions.length > 0 ? loadedSessions[0].messages : []);
    })();

    return () => { cancelled = true; };
  }, [user?.uid]);

  const isInitialMount = useRef(true);

  // Sync Sesi Chat ke Firestore + LocalStorage
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const uid = user?.uid || 'guest';
    const sessionsKey = `lomeal_ai_sessions_${uid}`;
    if (sessions.length > 0) {
      localStorage.setItem(sessionsKey, JSON.stringify(sessions));
    } else {
      localStorage.removeItem(sessionsKey);
    }

    if (!user?.uid) return;

    const timer = setTimeout(() => {
      const baseline = lastSavedSessionsRef.current || {};
      const newBaseline = {};
      const currentIds = new Set();

      sessions.forEach(s => {
        currentIds.add(s.id);
        const json = JSON.stringify(s);
        newBaseline[s.id] = json;
        if (baseline[s.id] === json) return;
        setDoc(doc(db, 'lomeal_users', user.uid, 'ai_sessions', s.id), s).catch(err => console.error('Sync sesi chat Lomy gagal:', err));
      });

      Object.keys(baseline).forEach(id => {
        if (!currentIds.has(id)) {
          deleteDoc(doc(db, 'lomeal_users', user.uid, 'ai_sessions', id)).catch(err => console.error('Hapus sesi chat cloud gagal:', err));
        }
      });

      lastSavedSessionsRef.current = newBaseline;
    }, 2000);

    return () => clearTimeout(timer);
  }, [sessions, user?.uid]);

  // Unread badge notification
  useEffect(() => {
    onUnreadChange?.(sessions.some(s => s.unread));
  }, [sessions, onUnreadChange]);

  // Thinking phase animation interval
  useEffect(() => {
    let interval;
    if (isLoading) {
      interval = setInterval(() => {
        setThinkingPhaseIdx((prev) => (prev + 1) % THINKING_PHASES.length);
      }, 2000);
    } else {
      setThinkingPhaseIdx(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Konteks Nutrisi Pengguna (7 hari + hari ini + Domus stock)
  const contextBlock = React.useMemo(() => {
    const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'sodium', 'sugar', 'fiber', 'caffeine', 'creatine'];
    const targets = profile?.targets || {};
    const labelOf = (k) => NUTRIENTS.find((n) => n.key === k)?.label || k;

    const totalsFor = (ymd) => {
      const out = {};
      for (const items of Object.values(daysMap?.[ymd]?.meals || {})) {
        for (const it of items || []) {
          for (const k of KEYS) out[k] = (out[k] || 0) + (Number(it.nutrition?.[k]) || 0);
        }
      }
      return out;
    };

    const today = totalsFor(todayYmd);
    const todayLine = KEYS.map((k) => {
      const v = Math.round(today[k] || 0);
      return targets[k] ? `${labelOf(k)}: ${v}/${Math.round(targets[k])}` : `${labelOf(k)}: ${v}`;
    }).join(', ');

    const week = [];
    for (let i = 6; i >= 1; i--) {
      const ymd = shiftYmd(todayYmd, -i);
      const tt = totalsFor(ymd);
      if (!tt.kcal) { week.push(`${ymd}: tidak ada catatan`); continue; }
      week.push(`${ymd}: ${KEYS.map((k) => `${labelOf(k)} ${Math.round(tt[k] || 0)}`).join(', ')}`);
    }

    const eaten = Object.values(daysMap?.[todayYmd]?.meals || {}).flat().map((e) => e.name).slice(0, 20);

    const domusStockStr = domusItems && domusItems.length > 0
      ? domusItems.slice(0, 30).map(d => `${d.name} (${d.quantity || 1} ${d.unit || 'pcs'})`).join(', ')
      : 'Tidak ada data stok dapur.';

    const userName = profile?.name || user?.displayName || 'Sobat';
    const rawGender = String(profile?.physical?.gender || profile?.gender || '').toLowerCase();
    const genderLabel = rawGender === 'female' || rawGender === 'wanita' || rawGender === 'f'
      ? 'Perempuan / Wanita (Gunakan sapaan "Sis" / "Kak" atau namanya)'
      : rawGender === 'male' || rawGender === 'pria' || rawGender === 'm'
      ? 'Laki-laki / Pria (Gunakan sapaan "Bro" / "Kak" atau namanya)'
      : 'Tidak spesifik (Gunakan nama langsung atau "kamu")';

    return [
      `Nama Pengguna: ${userName}`,
      `Gender Pengguna: ${genderLabel}`,
      profile?.physical?.weight ? `Berat Badan: ${profile.physical.weight} kg` : null,
      profile?.physical?.height ? `Tinggi Badan: ${profile.physical.height} cm` : null,
      `Tanggal hari ini: ${todayYmd}`,
      profile?.dietProfile ? `Program diet: ${profile.dietProfile}` : null,
      profile?.goal ? `Target utama: ${profile.goal}` : null,
      asList(profile?.medicalHistory).length ? `Riwayat medis: ${asList(profile.medicalHistory).join(', ')}` : null,
      asList(profile?.allergies).length ? `Alergi/Pantangan: ${asList(profile.allergies).join(', ')}` : null,
      targets.kcal ? `Target harian: ${KEYS.filter((k) => targets[k]).map((k) => `${labelOf(k)} ${Math.round(targets[k])}`).join(', ')}` : null,
      `Asupan hari ini — ${todayLine}`,
      eaten.length ? `Yang sudah dimakan hari ini: ${eaten.join(', ')}` : 'Belum ada makanan yang dicatat hari ini.',
      `6 hari sebelumnya:\n${week.join('\n')}`,
      `Stok bahan makanan di dapur (Domus):\n${domusStockStr}`,
    ].filter(Boolean).join('\n');
  }, [daysMap, todayYmd, profile, user, domusItems]);

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setIsSidebarOpen(false);
  };

  const handleDeleteChat = (e, id) => {
    e.stopPropagation();
    const doDeleteChat = (idToDelete) => {
      setSessions(prev => {
        const next = prev.filter(s => s.id !== idToDelete);
        if (activeSessionId === idToDelete) {
          if (next.length > 0) {
            setActiveSessionId(next[0].id);
            setMessages(next[0].messages);
          } else {
            setActiveSessionId(null);
            setMessages([]);
          }
        }
        return next;
      });
    };
    doDeleteChat(id);
  };

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const isFirstScroll = useRef(true);
  useEffect(() => {
    if (isFirstScroll.current) {
      isFirstScroll.current = false;
      return;
    }
    scrollToBottom('smooth');
  }, [messages, isLoading]);

  const handleSend = async (overridePrompt = null) => {
    const textToSend = overridePrompt || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = { role: 'user', content: textToSend.trim(), timestamp: Date.now() };

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const words = textToSend.trim().split(' ');
      const title = words.slice(0, 4).join(' ') + (words.length > 4 ? '...' : '');
      currentSessionId = 'session_' + Date.now();
      const newSession = { id: currentSessionId, title: title || 'Sesi Baru', messages: [userMsg], updatedAt: Date.now() };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(currentSessionId);
    } else {
      setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() } : s));
    }

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setIsLoading(true);

    const tempId = 'temp_' + Date.now();

    try {
      const recentHistory = messages.filter(m => !m.isError).slice(-10);
      const apiMessages = [
        ...recentHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.content })),
        { role: 'user', text: userMsg.content }
      ];

      setMessages(prev => [...prev, { id: tempId, role: 'assistant', content: '', timestamp: Date.now() }]);

      const isStillViewing = () => isOpenRef.current && activeSessionIdRef.current === currentSessionId;

      let streamedText = '';
      const reply = await streamLomyChat(
        aiKey,
        apiMessages,
        contextBlock,
        (chunk) => {
          streamedText += chunk;
          if (isStillViewing()) {
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: streamedText } : m));
          }
        },
        null,
        lomyPersona,
        lomyCustomInstruction,
        lomyMemory
      );

      const aiMsg = { role: 'assistant', content: reply, timestamp: Date.now() };
      const stillViewing = isStillViewing();
      if (stillViewing) {
        setMessages(prev => prev.map(m => m.id === tempId ? aiMsg : m));
      }
      setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, aiMsg], updatedAt: Date.now(), unread: !stillViewing } : s));
    } catch (err) {
      console.error('Lomy Chat Error:', err);
      if (isOpenRef.current && activeSessionIdRef.current === currentSessionId) {
        let errorMsg = `⚠️ ${err.message}`;
        if (err.message.includes('quota') || err.message.includes('RATE_LIMIT')) {
          errorMsg = 'Server Lomy sedang sibuk. Silakan periksa API Key pribadi di Pengaturan → Lanjutan.';
        }
        setMessages(prev => [...prev.filter(m => m.id !== tempId), { role: 'assistant', content: errorMsg, timestamp: Date.now(), isError: true }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMemory = (text) => {
    const trimmed = text.trim().slice(0, 160);
    setLomyMemory(prev => {
      const next = (prev || []).includes(trimmed) ? prev : [...(prev || []), trimmed];
      localStorage.setItem('lomeal_lomy_memory', JSON.stringify(next));
      return next;
    });
  };

  const autoResizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  };

  const handleListContinuation = () => {
    const el = inputRef.current;
    if (!el) return false;
    const pos = el.selectionStart;
    const value = el.value;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const currentLine = value.slice(lineStart, pos);
    const ul = currentLine.match(/^(\s*)([-*])\s+(.*)$/);
    const ol = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);

    if (ul) {
      const next = ul[3].trim() === ''
        ? value.slice(0, lineStart) + value.slice(pos)
        : value.slice(0, pos) + `\n${ul[1]}${ul[2]} ` + value.slice(pos);
      const caret = ul[3].trim() === '' ? lineStart : pos + `\n${ul[1]}${ul[2]} `.length;
      setInput(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = caret; autoResizeInput(); });
      return true;
    }
    if (ol) {
      const marker = ol[3].trim() === '' ? '' : `\n${ol[1]}${parseInt(ol[2], 10) + 1}. `;
      const next = ol[3].trim() === ''
        ? value.slice(0, lineStart) + value.slice(pos)
        : value.slice(0, pos) + marker + value.slice(pos);
      const caret = ol[3].trim() === '' ? lineStart : pos + marker.length;
      setInput(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = caret; autoResizeInput(); });
      return true;
    }
    return false;
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      if (handleListContinuation()) e.preventDefault();
    }
  };

  const handleAcceptRecipe = async (recipeData, key) => {
    if (!saveRecipesFn) return;
    try {
      const newRecipe = buildAiRecipe(recipeData, 'Coach Lomy');
      const existing = Array.isArray(recipes) ? recipes : [];
      await saveRecipesFn([newRecipe, ...existing]);
      setSavedRecipeKeys(prev => new Set([...prev, key]));
      showToast?.(`Resep "${newRecipe.name}" berhasil disimpan ke Buku Resep! 🍲`);
    } catch (err) {
      console.error('Gagal menyimpan usulan resep:', err);
    }
  };

  const handleAcceptFoodLog = async (foodData, key) => {
    if (!saveDay || !user?.uid) return;
    try {
      const session = foodData.session || 'dinner';
      const dayData = daysMap?.[todayYmd] || { meals: {} };
      const currentMeals = dayData.meals || {};
      const sessionEntries = currentMeals[session] || [];

      const newEntries = (foodData.foods || []).map(f => makeEntry({
        name: f.name,
        grams: Number(f.grams || 100),
        unit: f.unit || 'g',
        nutrition: { ...EMPTY_NUTRITION, ...(f.nutrition || {}) },
        source: 'ai',
        time: new Date().toTimeString().slice(0, 5)
      }));

      const updatedMeals = {
        ...currentMeals,
        [session]: [...sessionEntries, ...newEntries]
      };

      await saveDay(todayYmd, { ...dayData, meals: updatedMeals });
      setSavedFoodLogKeys(prev => new Set([...prev, key]));
      showToast?.(`Berhasil mencatat ${newEntries.length} menu ke Jurnal Hari Ini! 🎉`);
    } catch (err) {
      console.error('Gagal mencatat makanan:', err);
    }
  };

  const renderMessageContent = (msg, msgIdx) => {
    if (msg.isError) {
      return <div className="text-red-400 text-sm">{msg.content}</div>;
    }

    const content = msg.content || '';

    let recipeMatch = content.match(/<recipe_proposal>([\s\S]*?)<\/recipe_proposal>/);
    let recipeData = null;
    if (recipeMatch) {
      try {
        recipeData = JSON.parse(recipeMatch[1].trim());
      } catch (e) {
        console.warn('Gagal parse recipe proposal:', e);
      }
    }

    let foodMatch = content.match(/<food_proposal>([\s\S]*?)<\/food_proposal>/);
    let foodData = null;
    if (foodMatch) {
      try {
        foodData = JSON.parse(foodMatch[1].trim());
      } catch (e) {
        console.warn('Gagal parse food log proposal:', e);
      }
    }

    const cleanText = content
      .replace(/<recipe_proposal>[\s\S]*?<\/recipe_proposal>/g, '')
      .replace(/<food_proposal>[\s\S]*?<\/food_proposal>/g, '')
      .trim();

    const recipeKey = `recipe_${msg.id || msgIdx}`;
    const foodKey = `food_${msg.id || msgIdx}`;
    const isRecipeSaved = savedRecipeKeys.has(recipeKey);
    const isFoodSaved = savedFoodLogKeys.has(foodKey);
    const isRecipeExpanded = expandedRecipes.has(recipeKey);

    return (
      <div className="space-y-3">
        {cleanText && <div className="text-sm">{renderMiniMarkdown(cleanText)}</div>}

        {/* PROPOSAL KARTU RESEP */}
        {recipeData && (
          <div className="bg-neutral-900/90 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-4 space-y-3 mt-2 shadow-lg shadow-emerald-500/10 text-white animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <ChefHat size={18} />
                <span>Usulan Resep Masakan</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                {recipeData.durationMin && (
                  <span className="flex items-center gap-1"><Clock size={12} /> {recipeData.durationMin}m</span>
                )}
                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  {recipeData.portions || 1} Porsi
                </span>
              </div>
            </div>

            <div>
              <p className="font-bold text-white text-base leading-snug">{recipeData.name}</p>
              {recipeData.note && <p className="text-xs text-neutral-300 mt-1 italic">{recipeData.note}</p>}
            </div>

            {/* Accordion Bahan & Langkah */}
            <div className="bg-black/30 rounded-xl overflow-hidden border border-white/5">
              <button
                onClick={() => setExpandedRecipes(prev => {
                  const next = new Set(prev);
                  if (next.has(recipeKey)) next.delete(recipeKey); else next.add(recipeKey);
                  return next;
                })}
                className="w-full text-xs text-neutral-300 flex justify-between items-center p-2.5 text-left hover:bg-white/5 transition-colors"
              >
                <span className="font-semibold text-emerald-300">
                  {recipeData.ingredients?.length || 0} Bahan • {recipeData.components?.[0]?.steps?.length || 0} Langkah
                </span>
                <ChevronDown size={14} className={`text-neutral-400 transition-transform duration-200 ${isRecipeExpanded ? 'rotate-180' : ''}`} />
              </button>

              {isRecipeExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2 text-xs animate-in fade-in duration-150">
                  <div>
                    <span className="font-bold text-neutral-400 text-[11px] uppercase tracking-wider block mb-1">Bahan:</span>
                    <ul className="space-y-1 text-neutral-200 list-disc list-inside">
                      {(recipeData.ingredients || []).map((ing, i) => (
                        <li key={i}>{ing.name} {ing.grams ? `(${ing.grams} ${ing.unit || 'g'})` : ''}</li>
                      ))}
                    </ul>
                  </div>
                  {recipeData.components?.[0]?.steps?.length > 0 && (
                    <div className="mt-2">
                      <span className="font-bold text-neutral-400 text-[11px] uppercase tracking-wider block mb-1">Langkah:</span>
                      <ol className="space-y-1 text-neutral-200 list-decimal list-inside">
                        {recipeData.components[0].steps.map((st, i) => (
                          <li key={i} className="leading-relaxed">{st.text}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => handleAcceptRecipe(recipeData, recipeKey)}
              disabled={isRecipeSaved}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 ${isRecipeSaved ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20'}`}
            >
              {isRecipeSaved ? (
                <><Check size={16} /> Tersimpan di Buku Resep</>
              ) : (
                <><Bookmark size={16} /> Simpan ke Buku Resep</>
              )}
            </button>
          </div>
        )}

        {/* PROPOSAL KARTU CATAT JURNAL MAKANAN */}
        {foodData && (
          <div className="bg-neutral-900/90 backdrop-blur-md border border-teal-500/40 rounded-2xl p-4 space-y-3 mt-2 shadow-lg shadow-teal-500/10 text-white animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-teal-400 font-bold text-sm">
                <Utensils size={18} />
                <span>Catat Makanan ({foodData.sessionLabel || foodData.session || 'Makan'})</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {(foodData.foods || []).map((f, i) => (
                <div key={i} className="bg-black/30 p-2.5 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-white block">{f.name}</span>
                    <span className="text-[11px] text-neutral-400">{f.grams} {f.unit || 'g'}</span>
                  </div>
                  {f.nutrition?.kcal && (
                    <div className="text-right">
                      <span className="font-bold text-teal-300">{Math.round(f.nutrition.kcal)} kkal</span>
                      <span className="text-[10px] text-neutral-400 block font-mono">P: {Math.round(f.nutrition.protein || 0)}g</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => handleAcceptFoodLog(foodData, foodKey)}
              disabled={isFoodSaved}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 ${isFoodSaved ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40 cursor-default' : 'bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20'}`}
            >
              {isFoodSaved ? (
                <><Check size={16} /> Sudah Dicatat ke Jurnal Hari Ini</>
              ) : (
                <><Plus size={16} /> Catat ke Jurnal Hari Ini</>
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  if (phase === 'closed') return null;

  const ox = avatarOrigin?.x ?? window.innerWidth / 2;
  const oy = avatarOrigin?.y ?? window.innerHeight;

  const isAnimatingIn = phase === 'open';
  const isAnimatingOut = phase === 'closing';
  const scaleVal = isAnimatingIn ? 'scale(1)' : 'scale(0)';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[99] bg-black/70 backdrop-blur-sm"
        style={{
          opacity: isAnimatingIn ? 1 : 0,
          transition: isAnimatingIn ? 'opacity 0.3s ease' : 'opacity 0.28s ease',
          pointerEvents: isAnimatingIn ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Chat Panel — Spring scaled from avatar position */}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
        style={{
          transform: scaleVal,
          transformOrigin: `${ox}px ${oy}px`,
          transition: isAnimatingOut
            ? 'transform 0.3s cubic-bezier(0.4,0,1,1)'
            : 'transform 0.38s cubic-bezier(0.34,1.15,0.64,1)',
        }}
      >
        <div className="pointer-events-auto flex flex-col w-full max-w-md h-[85vh] max-h-[800px] bg-[#0a1510]/80 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden relative">
          {isSidebarOpen && <div className="absolute inset-0 bg-black/60 z-[110] transition-opacity cursor-pointer" onClick={() => setIsSidebarOpen(false)} />}

          {/* SIDEBAR SESI */}
          <div className={`absolute inset-y-0 left-0 w-64 bg-[#0a1510] border-r border-white/10 z-[120] transform transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4 border-b border-white/10">
              <button onClick={handleNewChat} className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                <Plus size={18} /> Chat Baru
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
                <div
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setMessages(session.messages);
                    setIsSidebarOpen(false);
                    if (session.unread) setSessions(prev => prev.map(s => s.id === session.id ? { ...s, unread: false } : s));
                  }}
                  className={`w-full text-left p-3 rounded-xl flex items-center justify-between group cursor-pointer transition-colors ${activeSessionId === session.id ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-neutral-400 hover:text-white'}`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeSessionId === session.id ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                    <span className="truncate text-sm font-medium">{session.title}</span>
                    {session.unread && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />}
                  </div>
                  <button onClick={(e) => handleDeleteChat(e, session.id)} className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Hapus">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col w-full h-full relative">
            {/* Ambient Background Glows */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-16 -left-12 w-64 h-64 rounded-full bg-emerald-500/20 blur-3xl" />
              <div className="absolute top-1/3 -right-16 w-72 h-72 rounded-full bg-teal-500/15 blur-3xl" />
              <div className="absolute bottom-0 left-1/4 w-56 h-56 rounded-full bg-emerald-400/10 blur-3xl" />
            </div>

            {/* HEADER */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full border-2 border-emerald-400 shadow-md bg-zinc-900 shrink-0"
                  style={{ backgroundImage: 'url(/bg-lomeal-coach.webp)', backgroundSize: '450%', backgroundPosition: '50% 12%' }}
                />
                <div>
                  <h3 className="font-bold text-white leading-tight">Coach Lomy</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-500"></span>
                    <span className="text-emerald-400 text-[10px] font-mono">Online</span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* CHAT AREA */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 z-10">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center space-y-4 mt-8 mb-4">
                  <div
                    className="w-16 h-16 rounded-full border-2 border-emerald-500 shadow-lg bg-zinc-900 shrink-0"
                    style={{ backgroundImage: 'url(/bg-lomeal-coach.webp)', backgroundSize: '450%', backgroundPosition: '50% 12%' }}
                  />
                  <div>
                    <p className="text-white font-bold text-base">Tanya Seputar Nutrisi &amp; Gizi!</p>
                    <p className="text-xs text-neutral-400 max-w-[280px] mx-auto mt-1">Saya bisa menganalisa asupan harianmu, ide resep dari dapur Domus, hingga timing suplemen.</p>
                    <p className="text-xs text-neutral-500 mt-3 font-medium">Pilih topik cepat di bawah:</p>
                  </div>
                  <div className="w-full space-y-2 mt-4">
                    {FAQ_ITEMS.map((faq, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(faq.prompt)}
                        className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-sm p-3 rounded-xl transition-colors group flex items-center justify-between"
                      >
                        <span className="flex-1 pr-2">{faq.q}</span>
                        <ChevronRight size={16} className="text-neutral-600 group-hover:text-emerald-400 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isThinkingPlaceholder = msg.role !== 'user' && msg.content === '' && isLoading && idx === messages.length - 1;
                return (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2 items-end mb-2`}>
                    {msg.role !== 'user' && (
                      <div
                        className="w-8 h-8 rounded-full border border-white/20 shadow-md shrink-0 mb-1"
                        style={{ backgroundImage: 'url(/bg-lomeal-coach.webp)', backgroundSize: '450%', backgroundPosition: '50% 12%' }}
                      />
                    )}
                    {msg.role === 'user' && (
                      <button
                        onClick={() => handleSaveMemory(msg.content)}
                        title="Simpan sebagai memori"
                        className={`p-1.5 rounded-full transition-colors mb-1 shrink-0 ${(lomyMemory || []).includes(msg.content.trim().slice(0, 160)) ? 'text-emerald-400' : 'text-neutral-600 hover:text-emerald-400'}`}
                      >
                        <Bookmark size={14} fill={(lomyMemory || []).includes(msg.content.trim().slice(0, 160)) ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-gradient-to-b from-emerald-500/30 to-emerald-600/15 backdrop-blur-xl saturate-150 border border-emerald-400/30 shadow-lg text-white rounded-tr-sm' : 'bg-gradient-to-b from-white/15 to-white/5 backdrop-blur-xl saturate-150 text-neutral-100 border border-white/15 rounded-tl-sm shadow-lg shadow-black/20'}`}>
                      {isThinkingPlaceholder ? (
                        <div className="flex items-center gap-2">
                          <Loader2 size={16} className="text-emerald-400 animate-spin shrink-0" />
                          <span className="text-xs text-emerald-300">{THINKING_PHASES[thinkingPhaseIdx]}</span>
                        </div>
                      ) : (
                        <>
                          {renderMessageContent(msg)}
                          <div className={`text-[10px] mt-2 opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* INPUT AREA */}
            <div className="p-4 pb-8 sm:pb-4 border-t border-white/10 bg-black/40 backdrop-blur-md z-10">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-3 text-neutral-400 hover:text-white bg-white/5 border border-white/10 rounded-xl transition-colors shrink-0"
                  title="Menu Sesi Chat"
                >
                  <Menu size={20} />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); autoResizeInput(); }}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Tanya Coach Lomy…"
                  className="flex-1 bg-white/[0.04] backdrop-blur-sm text-white text-sm rounded-xl px-4 py-3 outline-none border border-white/5 focus:border-emerald-500/50 resize-none max-h-32"
                  rows={1}
                  style={{ minHeight: '44px' }}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="p-3 bg-emerald-500/80 hover:bg-emerald-600 backdrop-blur-md border border-emerald-400/30 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white rounded-xl transition-colors shrink-0 flex items-center justify-center"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
