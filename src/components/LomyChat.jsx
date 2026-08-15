import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, Send, Sparkles, Square, Trash2 } from 'lucide-react';
import { streamLomyChat } from '../utils/aiFood';
import { checkAndCountAiUsage, refundAiUsage } from '../utils/foodLog';
import { AI_DAILY_LIMIT, getLocalYMD, getMonthKey } from '../data/constants';
import { NUTRIENTS } from '../data/nutrition';
import useWakeLock from '../hooks/useWakeLock';
import useBackClose from '../hooks/useBackClose';

const POS_KEY = 'lomeal_lomy_pos';
const CHAT_KEY = 'lomeal_lomy_chat';
const SIZE = 56;
const EDGE = 16;
const TOP_SAFE = 72;
const BOT_SAFE = 100;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const snapX = (x) => (x + SIZE / 2 < window.innerWidth / 2 ? EDGE : window.innerWidth - SIZE - EDGE);
const clampY = (y) => clamp(y, TOP_SAFE, window.innerHeight - SIZE - BOT_SAFE);

const SUGGESTIONS = [
  'Hari ini gizi ku gimana?',
  'Evaluasi pola makanku seminggu terakhir dong',
  'Menu makan malam yang tinggi protein?',
];

const shiftYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return getLocalYMD(new Date(y, m - 1, d + days));
};

/**
 * Lomy — chat gizi mengambang. Tombolnya bisa digeser dan menempel ke tepi layar,
 * posisinya diingat. Jawabannya streaming supaya balasan panjang tidak terasa menggantung.
 */
export default function LomyChat({ t, user, aiKey, profile, daysMap, ensureMonth, todayYmd = getLocalYMD(), showAlert }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY)) || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const wakeLock = useWakeLock();

  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY));
      if (saved && typeof saved.x === 'number') return { x: clamp(saved.x, 0, window.innerWidth - SIZE), y: clampY(saved.y) };
    } catch { /* posisi rusak — pakai default */ }
    return { x: window.innerWidth - SIZE - EDGE, y: clampY(TOP_SAFE + 10) };
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ moved: false, dx: 0, dy: 0 });

  useBackClose(open, () => setOpen(false));

  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-30))); } catch { /* kuota penuh */ }
  }, [messages]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // Rentang 7 hari bisa menyeberang bulan; tanpa ini konteks mingguannya bolong di awal bulan.
  useEffect(() => {
    if (!open || !ensureMonth) return;
    new Set([0, 6].map((i) => getMonthKey(shiftYmd(todayYmd, -i)))).forEach(ensureMonth);
  }, [open, ensureMonth, todayYmd]);

  // Ringkasan hari ini + 7 hari terakhir. Tanpa rentang mingguan, Lomy tidak bisa menggantikan
  // tombol "Evaluasi Mingguan" yang dulu ada di kalender — dia cuma tahu hari ini.
  const contextBlock = useMemo(() => {
    const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'sodium', 'sugar', 'fiber'];
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
    return [
      `Tanggal hari ini: ${todayYmd}`,
      profile?.dietProfile ? `Program diet: ${profile.dietProfile}` : null,
      profile?.medicalHistory?.length ? `Riwayat medis: ${profile.medicalHistory.join(', ')}` : null,
      profile?.allergies?.length ? `Alergi: ${profile.allergies.join(', ')}` : null,
      targets.kcal ? `Target harian: ${KEYS.filter((k) => targets[k]).map((k) => `${labelOf(k)} ${Math.round(targets[k])}`).join(', ')}` : null,
      `Asupan hari ini — ${todayLine}`,
      eaten.length ? `Yang dimakan hari ini: ${eaten.join(', ')}` : 'Belum ada yang dicatat hari ini.',
      `6 hari sebelumnya:\n${week.join('\n')}`,
    ].filter(Boolean).join('\n');
  }, [daysMap, todayYmd, profile]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');

    const quota = await checkAndCountAiUsage(user.uid, todayYmd, AI_DAILY_LIMIT);
    if (!quota.allowed) return showAlert(`Kuota Lomy harian habis (${AI_DAILY_LIMIT} request/hari). Besok reset ya.`);

    const history = [...messages, { role: 'user', text: q }];
    setMessages([...history, { role: 'assistant', text: '' }]);
    setBusy(true);
    wakeLock.request();

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamLomyChat(aiKey, history, contextBlock, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', text: next[next.length - 1].text + delta };
          return next;
        });
      }, controller.signal);
    } catch (err) {
      if (err.name === 'AbortError') {
        await refundAiUsage(user.uid);
        setMessages((prev) => {
          const next = [...prev];
          // Balasan kosong yang dibatalkan cuma jadi gelembung hantu — buang saja.
          if (!next[next.length - 1].text) next.pop();
          return next;
        });
      } else {
        await refundAiUsage(user.uid);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', text: `⚠️ ${err.message}`, error: true };
          return next;
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      wakeLock.release();
    }
  };

  // ---- drag FAB ----
  const onPointerDown = (e) => {
    dragRef.current = { moved: false, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    dragRef.current.moved = true;
    setPos({ x: e.clientX - dragRef.current.dx, y: clampY(e.clientY - dragRef.current.dy) });
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    setPos((p) => {
      const snapped = { x: snapX(p.x), y: clampY(p.y) };
      try { localStorage.setItem(POS_KEY, JSON.stringify(snapped)); } catch { /* abaikan */ }
      return snapped;
    });
    if (!dragRef.current.moved) setOpen(true);
  };

  const bubble = (m, i) => (
    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 body-md whitespace-pre-wrap break-words ${
        m.role === 'user' ? `${t.bgAccent} text-white` : m.error ? 'bg-red-500/10 text-red-500' : `${t.bgSunken} ${t.textMain}`
      }`}>
        {m.text || <span className="inline-flex gap-1 items-center opacity-60">
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: '300ms' }} />
        </span>}
      </div>
    </div>
  );

  return (
    <>
      {!open && (
        <button
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          style={{
            left: pos.x, top: pos.y, width: SIZE, height: SIZE,
            transition: dragging ? 'none' : 'left 320ms cubic-bezier(0.22,1,0.36,1), top 320ms cubic-bezier(0.22,1,0.36,1)',
          }}
          className={`fixed z-[90] rounded-full shadow-2xl ${t.bgAccent} text-white flex items-center justify-center touch-none no-swipe active:scale-95`}
          aria-label="Buka Lomy"
        >
          <Sparkles size={24} />
          {busy && <span className="absolute inset-0 rounded-full border-2 border-white/60 animate-ping" />}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[95] flex flex-col justify-end no-swipe">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className={`relative ${t.bgCardSolid} border-t ${t.border} rounded-t-3xl flex flex-col max-h-[85vh] h-[85vh] animate-in slide-in-from-bottom-8 duration-300`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border} shrink-0`}>
              <div className="flex items-center gap-2">
                <Sparkles size={18} className={t.textAccent} />
                <h2 className={`h2 ${t.textMain}`}>Lomy</h2>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={() => setMessages([])} className={`p-2 rounded-xl ${t.btnBg} ${t.textMuted}`} aria-label="Bersihkan obrolan">
                    <Trash2 size={15} />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className={`p-2 rounded-xl ${t.btnBg} ${t.textMuted}`} aria-label="Tutup">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
              {messages.length === 0 ? (
                <div className="py-6 space-y-3">
                  <p className={`body-md ${t.textMuted} text-center`}>Tanya apa saja soal makanan dan gizimu.</p>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className={`w-full text-left px-4 py-3 rounded-2xl border ${t.border} ${t.bgSunken} ${t.textMain} body-md`}>
                      {s}
                    </button>
                  ))}
                </div>
              ) : messages.map(bubble)}
            </div>

            <div className={`shrink-0 p-3 border-t ${t.border} flex items-end gap-2`}>
              <textarea
                rows={1} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Tanya Lomy…"
                className={`flex-1 resize-none max-h-28 px-4 py-3 rounded-2xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`}
              />
              {busy ? (
                <button onClick={stop} className="p-3 rounded-2xl bg-red-500 text-white shrink-0" aria-label="Hentikan">
                  <Square size={18} fill="currentColor" />
                </button>
              ) : (
                <button onClick={() => send()} disabled={!input.trim()} className={`p-3 rounded-2xl ${t.bgAccent} shrink-0 disabled:opacity-40`} aria-label="Kirim">
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
