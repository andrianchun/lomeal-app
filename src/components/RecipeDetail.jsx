import React, { useMemo, useState } from 'react';
import { X, Share2, Loader2, Minus, Plus, Clock, Flame, ChefHat, Pencil, Timer, ShoppingCart, Leaf, ChevronLeft, ChevronDown } from 'lucide-react';
import { NUTRIENTS } from '../data/nutrition';
import { heroForRecipe, formatDuration, formatClock } from '../data/constants';
import { STATUS } from '../theme';
import { requestShoppingListDomus } from '../utils/domusSync';
import { itemStock, formatStock } from '../utils/stockConverter';
import { blockingShortages, formatShortfall, ingredientAvailability, shortfallInItemUnit } from '../utils/recipeStock.js';
import { PillTabs, CheckBox } from './RecipeBits';
import useBackClose from '../hooks/useBackClose';

/**
 * Layar detail resep (gaya kartu program Logym): hero foto penuh + sheet melengkung
 * berisi judul, penulis, penakar porsi, chip stat, lalu tab Bahan / Langkah.
 * Read-only — mencentang di sini cuma alat bantu belanja/siap-siap, bukan sesi masak.
 */
const RecipeDetail = ({ t, theme, user, recipe, domusItems, onClose, onCook, onEdit, onShare, shareBusy, showToast }) => {
  const [servings, setServings] = useState(Math.max(1, Number(recipe.portions) || 1));
  const [tab, setTab] = useState('bahan');
  const [showMicros, setShowMicros] = useState(false);
  // Centang bahan = niat user, TERPISAH dari ketersediaan stok. Dulu bahan yang ke-match
  // inventaris dipaksa tercentang dan klik-nya diblokir, jadi salah match tidak bisa dibatalkan
  // dan bahan itu ikut hilang dari daftar belanja. Di sini stok cuma jadi nilai awal.
  const [overrides, setOverrides] = useState(() => new Map());
  const [cartBusy, setCartBusy] = useState(false);
  const [cartDone, setCartDone] = useState(false);
  const isDark = theme === 'dark';

  useBackClose(true, onClose);

  const basePortions = Math.max(1, Number(recipe.portions) || 1);
  const factor = servings / basePortions;
  const perPortion = recipe.perPortion || {};
  const components = recipe.components || [];

  const toggle = (key, current) => setOverrides((m) => new Map(m).set(key, !current));

  const totalSteps = useMemo(() => components.reduce((n, c) => n + c.steps.length, 0), [components]);

  // Cek bahan ke inventaris Domus — biar user tahu apa yang harus dibeli SEBELUM mulai masak,
  // bukan pas wajan sudah panas. Hitungannya di utils/recipeStock.js (ada tesnya) karena dipakai
  // DUA tempat: daftar bahan di bawah, dan gerbang tombol "Mulai Masak" di CTA.
  const rows = useMemo(() => {
    const base = ingredientAvailability(recipe, factor, domusItems);
    return base.map((r) => ({ ...r, on: overrides.has(r.key) ? overrides.get(r.key) : r.enough }));
  }, [recipe, domusItems, factor, overrides]);

  /**
   * Bahan yang bikin masak gak bisa jalan: stoknya keukur dan kurang. Sengaja BUKAN `rows.on` —
   * centang di daftar itu "gak usah dibeli", bukan "anggap aja ada". Kalau centang bisa nembus
   * gerbang ini, gerbangnya cuma hiasan dan stok Domus balik jadi angka bohong.
   */
  const blockers = useMemo(() => blockingShortages(rows), [rows]);

  // Bahan yang belum dicentang perlu dibeli. Kalau stoknya ada tapi kurang, cukup beli selisihnya.
  // Jumlahnya dibawa sebagai ANGKA + SATUAN terpisah, BUKAN ditempel ke nama: Domus nyimpen jumlah
  // di field sendiri, dan nama yang ketempelan "(200 g lagi)" gak bakal cocok lagi waktu
  // belanjaannya balik lewat nota Darka.
  const missing = useMemo(() => {
    const seen = new Map();
    for (const r of rows) {
      if (r.on || seen.has(r.name)) continue;
      // Kurang -> beli selisihnya; belum punya sama sekali -> beli sebutuhnya.
      const short = r.shortfall > 0 ? shortfallInItemUnit(r) : null;
      seen.set(r.name, {
        // Nama BARANGNYA (kalau ketemu), bukan nama bahan di resep: entri belanjanya kudu kebaca
        // sebagai barang yang sama dengan yang ada di inventaris.
        name: r.match?.name || r.name,
        // `itemId` yang bikin belanjaan ini mendarat balik ke barang yang tepat waktu notanya
        // masuk lewat Darka — nama cuma cadangan buat bahan yang belum pernah kecatat.
        itemId: r.match?.id ?? null,
        qtyValue: short ? Math.ceil(short.value) : (r.needed > 0 ? r.needed : null),
        qtyUnit: short ? short.unit : (r.needed > 0 ? 'g' : null),
      });
    }
    return [...seen.values()];
  }, [rows]);

  const addMissingToCart = async () => {
    setCartBusy(true);
    try {
      for (const m of missing) await requestShoppingListDomus(user.uid, m.name, { qtyValue: m.qtyValue, qtyUnit: m.qtyUnit, itemId: m.itemId });
      setCartDone(true);
      showToast?.(`${missing.length} bahan masuk list belanja 🛒`);
    } catch (e) {
      showToast?.(`Gagal menambah ke list belanja: ${e.message}`, { type: 'error' });
    } finally {
      setCartBusy(false);
    }
  };

  const roundBtn = `w-10 h-10 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform backdrop-blur-md border ${isDark ? 'bg-black/40 border-white/10 text-white' : 'bg-white/60 border-black/5 text-black'}`;
  const softCard = isDark ? 'bg-white/[0.06]' : 'bg-black/[0.04]';

  const StatChip = ({ value, label, tone }) => (
    <div className={`flex-1 min-w-0 rounded-2xl px-2.5 py-2.5 flex flex-col items-center justify-center text-center ${softCard}`}>
      <span className={`h2 tabular-nums truncate ${tone || t.textMain}`}>{value}</span>
      <p className={`caption font-medium truncate ${t.textMuted}`}>{label}</p>
    </div>
  );

  return (
    <div className={`fixed inset-0 z-[60] overflow-hidden ${isDark ? 'bg-[#070a08]' : 'app-bg-light'}`}>
      {/* ---------- HERO BACKGROUND (STATIC) ---------- */}
      <div className="absolute top-0 inset-x-0 h-[38vh] min-h-[240px] w-full bg-cover bg-center"
        style={{ backgroundImage: `url('${heroForRecipe(recipe)}')` }}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
      </div>

      {/* ---------- FLOATING TOP BUTTONS ---------- */}
      <div className="absolute top-0 inset-x-0 p-4 pt-safe flex items-center justify-between z-20 pointer-events-none">
        <div className="pointer-events-auto">
          <button onClick={onClose} className={roundBtn}><ChevronLeft size={20} /></button>
        </div>
        <div className="flex gap-2 pointer-events-auto">
          <button onClick={onEdit} className={roundBtn}><Pencil size={16} /></button>
          <button onClick={onShare} disabled={shareBusy} className={`${roundBtn} disabled:opacity-60`}>
            {shareBusy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
          </button>
        </div>
      </div>

      {/* ---------- SCROLLABLE SHEET ---------- */}
      <div className="absolute inset-0 z-10 overflow-y-auto pb-safe">
        {/* Spacer */}
        <div className="h-[38vh] min-h-[240px] w-full" />
        
        <div className={`relative -mt-8 rounded-t-[2rem] ${isDark ? 'bg-[#070a08]/85 border-t border-white/10' : 'bg-white/85 border-t border-black/5'} backdrop-blur-2xl min-h-[62vh] pb-48 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]`}>
        <div className={`w-10 h-1 rounded-full mx-auto mt-3 ${isDark ? 'bg-white/20' : 'bg-black/15'}`} />

        <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
          <div>
            <h1 className={`h1 text-center ${t.textMain}`}>{recipe.name}</h1>
            <p className={`caption font-medium text-center mt-1 ${t.textMuted}`}>{recipe.authorName || 'Resep kamu'}</p>
          </div>

          {/* Grid Statistik 3x2 */}
          <div className="grid grid-cols-3 gap-2">
            {/* --- Baris Atas --- */}
            <div className={`flex items-center justify-between rounded-2xl px-2 py-2.5 ${softCard}`}>
              <button onClick={() => setServings((s) => Math.max(1, s - 1))}
                className={`w-7 h-7 shrink-0 rounded-full ${t.btnBg} ${t.textMain} flex items-center justify-center`}><Minus size={13} /></button>
              <div className="flex-1 text-center min-w-0">
                <span className={`h2 tabular-nums ${t.textMain} block`}>{servings}</span>
                <p className={`caption font-medium ${t.textMuted}`}>porsi</p>
              </div>
              <button onClick={() => setServings((s) => Math.min(20, s + 1))}
                className={`w-7 h-7 shrink-0 rounded-full ${t.btnBg} ${t.textMain} flex items-center justify-center`}><Plus size={13} /></button>
            </div>
            
            <StatChip value={formatDuration(recipe.durationMin)} label="durasi" tone={t.textMain} />
            <StatChip value={Math.round(perPortion.kcal || 0)} label="kkal/porsi" tone={t.textAccent} />

            {/* --- Baris Bawah --- */}
            {[['protein', 'Protein'], ['carbs', 'Karbo'], ['fat', 'Lemak']].map(([k, label]) => (
              <div key={k} className={`rounded-2xl px-2 py-2.5 flex flex-col items-center justify-center text-center ${isDark ? 'bg-white/[0.04]' : 'bg-black/[0.03]'}`}>
                <span className={`h2 tabular-nums ${t.textMain}`}>{Math.round(perPortion[k] || 0)}g</span>
                <p className={`caption font-medium ${t.textMuted}`}>{label}</p>
              </div>
            ))}
          </div>

          <button onClick={() => setShowMicros(!showMicros)}
            className={`w-full flex items-center justify-center gap-1 py-2 caption font-bold rounded-xl ${t.btnBg} ${t.textMuted} active:scale-[0.98] transition-transform`}>
            {showMicros ? 'Sembunyikan Mikronutrien' : 'Lihat Mikronutrien'}
            <ChevronDown size={14} className={`transition-transform duration-300 ${showMicros ? 'rotate-180' : ''}`} />
          </button>

          {showMicros && (
            <div className={`rounded-xl border ${t.border} divide-y ${t.border}`}>
              {NUTRIENTS.filter(n => !n.macro && perPortion[n.key]).map(n => (
                <div key={n.key} className="flex justify-between px-3 py-2.5">
                  <span className={`caption ${t.textMuted}`}>{n.label}</span>
                  <span className={`caption font-bold ${t.textMain}`}>{Math.round((perPortion[n.key] || 0) * 10) / 10} {n.unit}</span>
                </div>
              ))}
              {!NUTRIENTS.some(n => !n.macro && perPortion[n.key]) && (
                <div className={`px-4 py-3 caption text-center ${t.textMuted}`}>Tidak ada data nutrisi mikro.</div>
              )}
            </div>
          )}

          {recipe.note &&<p className={`body-md font-medium ${t.textMuted}`}>{recipe.note}</p>}

          <PillTabs t={t} theme={theme} value={tab} onChange={setTab}
            tabs={[['bahan', `Bahan (${recipe.ingredients.length})`], ['langkah', `Langkah (${totalSteps})`]]} />

          {/* ---------- BAHAN ---------- */}
          {tab === 'bahan' && (
            <div className="space-y-3">
              {servings !== basePortions && (
                <p className={`caption italic opacity-70 ${t.textMuted}`}>Gramasi untuk {servings} porsi (resep asli {basePortions} porsi)</p>
              )}
              <div className="space-y-0.5">
                {rows.map((r) => (
                  <button key={r.key} onClick={() => toggle(r.key, r.on)} className="w-full flex items-start gap-3 py-2.5 text-left active:scale-[0.98] transition-transform">
                    <span className={`w-1.5 h-1.5 shrink-0 rounded-full mt-2 ${r.match ? (isDark ? 'bg-white' : 'bg-black') : (isDark ? 'bg-white/20' : 'bg-black/20')}`} />
                    <span className="flex-1 min-w-0">
                      <span className={`block body-md ${r.on ? `line-through ${t.textMuted}` : t.textMain}`}>{r.name}</span>
                      {r.match && (
                        <span className={`block caption ${r.enough ? t.textMuted : 'text-amber-500'}`}>
                          {r.have == null
                            ? `ada di ${r.match.name}`
                            : `sisa ${formatStock(itemStock(r.match))}${r.shortfall > 0 ? ` · kurang ${Math.ceil(shortfallInItemUnit(r).value)} ${shortfallInItemUnit(r).unit}` : ''}`}
                        </span>
                      )}
                    </span>
                    <span className={`caption font-medium tabular-nums ${t.textMuted} pt-0.5`}>{r.needed} g</span>
                    <CheckBox t={t} checked={r.on} />
                  </button>
                ))}
              </div>

              {missing.length > 0 && (
                <div className={`mt-6 rounded-2xl border ${t.border} ${t.bgCard} p-4`}>
                  <p className={`body-md ${t.textMain}`}>{missing.length} bahan belum ada di dapur</p>
                  <p className={`caption font-medium mt-1 ${t.textMuted}`}>
                    {missing.map((m) => (m.qtyValue ? `${m.name} (${m.qtyValue} ${m.qtyUnit})` : m.name)).join(', ')}
                  </p>
                  <button onClick={addMissingToCart} disabled={cartBusy || cartDone}
                    className={`w-full mt-4 py-2.5 rounded-xl caption font-bold flex items-center justify-center gap-2 disabled:opacity-60 ${
                      cartDone ? `${t.bgAccentSoft} border ${t.borderAccentSoft} ${t.textAccent}` : t.bgAccent}`}>
                    {cartBusy ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
                    {cartDone ? 'Berhasil dikirim ke Domus' : 'Tambah List Belanja Domus'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---------- LANGKAH ---------- */}
          {tab === 'langkah' && (
            <div className="space-y-5">
              {components.length === 0 && (
                <div className={`rounded-3xl border-2 border-dashed ${t.borderDashed} p-6 text-center`}>
                  <ChefHat size={26} className={`mx-auto mb-2 ${t.textMuted}`} />
                  <p className={`caption font-medium ${t.textMuted}`}>Resep ini belum punya langkah memasak. Tekan ikon pensil untuk menambahkannya.</p>
                </div>
              )}
              {components.map((c, ci) => (
                <div key={c.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 shrink-0 rounded-lg ${t.bgAccentSoft} ${t.textAccent} caption flex items-center justify-center`}>{ci + 1}</span>
                    <p className={`h2 ${t.textMain}`}>{c.name || `Komponen ${ci + 1}`}</p>
                  </div>
                  {c.steps.map((s, si) => (
                    <div key={s.id} className={`rounded-2xl border ${t.border} ${t.bgCard} p-4`}>
                      <p className={`h3 mb-1 ${t.textMuted}`}>Langkah {si + 1}</p>
                      <p className={`body-md ${t.textMain}`}>{s.text}</p>
                      {s.photoUrl && <img src={s.photoUrl} alt="" className="w-full h-32 object-cover rounded-xl mt-3" />}
                      {s.timerSec > 0 && (
                        <p className={`caption mt-2 flex items-center gap-1.5 ${t.textAccent}`}>
                          <Timer size={13} /> {formatClock(s.timerSec)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* ---------- CTA ---------- */}
      <div className={`fixed bottom-0 inset-x-0 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-50 ${isDark ? 'bg-[#0a1510]/90' : 'bg-white/90'} backdrop-blur-xl border-t ${t.border}`}>
        {blockers.length > 0 && (
          <div className="max-w-2xl mx-auto mb-2 flex flex-col gap-1.5">
            <p className={`caption font-bold ${STATUS.warn.text}`}>
              {blockers.map(formatShortfall).join(' · ')}
            </p>
            <button
              onClick={addMissingToCart}
              disabled={cartBusy || cartDone || missing.length === 0}
              className={`w-full py-2.5 rounded-2xl border ${t.border} ${t.textMain} body-md flex items-center justify-center gap-2 disabled:opacity-40`}
            >
              <ShoppingCart size={16} />
              {cartDone ? 'Sudah masuk keranjang' : cartBusy ? 'Menambahkan…' : 'Tambah kekurangan ke keranjang'}
            </button>
          </div>
        )}
        <button
          onClick={() => onCook(servings)}
          disabled={blockers.length > 0}
          title={blockers.length > 0 ? 'Stok bahannya kurang' : undefined}
          className={`w-full max-w-2xl mx-auto py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow flex items-center justify-center gap-2 disabled:opacity-40 disabled:shadow-none`}>
          {/* Stok kurang = gak bisa masak. Jalan keluarnya belanja dulu (stok Domus kebarui
              sendiri begitu notanya masuk), atau ubah resep/porsinya — bukan nerobos dan bikin
              catatan stoknya bohong. */}
          <ChefHat size={18} /> {blockers.length > 0 ? 'Bahan belum cukup' : 'Mulai Masak'}
        </button>
      </div>
    </div>
  );
};

export default RecipeDetail;
