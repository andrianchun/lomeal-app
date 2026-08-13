import React, { useRef, useState } from 'react';
import { X, Timer, ChefHat, Camera, Loader2, Share2, Utensils, Refrigerator, ChevronDown, Check } from 'lucide-react';
import { formatClock, MEAL_SESSIONS } from '../data/constants';
import { STATUS } from '../theme';
import { compressImage, PHOTO_KEEPSAKE } from '../utils/aiFood';
import { uploadRecipePhoto } from '../utils/foodLog';
import { PillTabs, CheckBox } from './RecipeBits';
import useCookTimers, { clearCookSession } from '../hooks/useCookTimers';
import useBackClose from '../hooks/useBackClose';

/**
 * Mode masak: langkah dikelompokkan per KOMPONEN dan boleh dikerjakan tidak berurutan.
 * Sambil nunggu nasi matang (timer jalan sebagai chip di atas), user tinggal buka
 * komponen lain dan lanjut marinasi ayam. Timer jalan barengan, tetap hidup walau app
 * ditinggal, dan bunyi + notifikasi begitu habis.
 */
const MAX_PHOTOS = 5;

const CookingSession = ({ t, theme, user, recipe, servings, domusLocations, soundEnabled = true, onClose, onFinish, onShare, showToast }) => {
  const isDark = theme === 'dark';
  const components = recipe.components || [];
  const [openComp, setOpenComp] = useState(components[0]?.id || null);
  const [tab, setTab] = useState('langkah');
  const [finishing, setFinishing] = useState(false);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('eat'); // eat | prep
  const [sessionId, setSessionId] = useState('lunch');
  const [locationId, setLocationId] = useState(''); // '' = simpan di stok Lomeal saja
  const [domusOpen, setDomusOpen] = useState(false);
  const fileRef = useRef(null);

  const { timers, addTimer, removeTimer, clearAll, done, toggleDone, remainingSec } = useCookTimers({
    recipeId: recipe.id, recipeName: recipe.name, servings, soundEnabled,
  });

  // Nutup layar masak selagi ada timer jalan = cuma minggir sebentar; sesinya ditahan supaya
  // bisa dilanjut dari notifikasi. Kalau gak ada timer, sesi dibuang biar gak nempel selamanya.
  const close = () => {
    if (timers.length === 0) clearCookSession();
    onClose();
  };

  useBackClose(true, () => (finishing ? setFinishing(false) : close()));

  const basePortions = Math.max(1, Number(recipe.portions) || 1);
  const factor = servings / basePortions;
  const totalSteps = components.reduce((n, c) => n + c.steps.length, 0);
  const doneCount = components.reduce((n, c) => n + c.steps.filter((s) => done.has(s.id)).length, 0);

  const onPhotoPicked = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_PHOTOS - photoUrls.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const { dataUrl } = await compressImage(file, PHOTO_KEEPSAKE);
        const url = await uploadRecipePhoto(user.uid, recipe.id, dataUrl);
        setPhotoUrls((p) => [...p, url]);
      }
    } catch (err) {
      showToast?.(`Gagal unggah foto: ${err.message}`, { type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await onFinish({ mode, sessionId, locationId, photoUrl: photoUrls[0] || null, photoUrls, servings });
      clearAll();
      onClose();
    } catch (err) {
      showToast?.(`Gagal menyimpan: ${err.message}`, { type: 'error' });
      setSaving(false);
    }
  };

  const bottomBar = `fixed bottom-0 inset-x-0 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${
    isDark ? 'bg-[#0a1510]/90' : 'bg-white/90'} backdrop-blur-xl border-t ${t.border}`;

  // ============ LAYAR SELESAI MASAK ============
  if (finishing) return (
    <div className={`fixed inset-0 z-50 overflow-y-auto ${isDark ? 'bg-[#070a08]' : 'app-bg-light'}`}>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPhotoPicked} />
      <div className="max-w-2xl mx-auto px-4 pt-safe pb-32 space-y-3">

        {/* BANNER SELAMAT */}
        <div className={`relative rounded-3xl overflow-hidden p-5 text-white bg-gradient-to-br ${t.gradientBg} shadow-glow-lg anim-rise`}>
          <ChefHat size={80} className="absolute -right-4 -bottom-4 opacity-15" />
          <p className="caption font-medium opacity-90">Masakan selesai 🎉</p>
          <h1 className="h1 mt-1">{recipe.name}</h1>
          <p className="caption font-medium opacity-90 mt-2">
            {servings} porsi · {Math.round((recipe.perPortion?.kcal || 0) * servings)} kkal total · {doneCount}/{totalSteps || '—'} langkah beres
          </p>
        </div>

        {/* FOTO HASIL — potret, geser kanan-kiri kalau lebih dari satu */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar snap-x snap-mandatory -mx-4 px-4">
          {photoUrls.map((url, i) => (
            <div key={url} className={`relative shrink-0 snap-center ${photoUrls.length > 1 ? 'w-[78%]' : 'w-full'} aspect-[3/4] rounded-3xl overflow-hidden border ${t.border}`}>
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setPhotoUrls((p) => p.filter((u) => u !== url))}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
                <X size={15} />
              </button>
              <span className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full bg-black/60 text-white caption">{i + 1}/{photoUrls.length}</span>
            </div>
          ))}
          {photoUrls.length < MAX_PHOTOS && (
            <button onClick={() => fileRef.current?.click()}
              className={`shrink-0 snap-center ${photoUrls.length ? 'w-[78%]' : 'w-full'} aspect-[3/4] rounded-3xl border-2 border-dashed ${t.borderDashed} ${t.bgCard} flex items-center justify-center`}>
              <div className="text-center px-4">
                {uploading ? <Loader2 size={22} className={`mx-auto mb-1.5 animate-spin ${t.textMuted}`} /> : <Camera size={22} className={`mx-auto mb-1.5 ${t.textMuted}`} />}
                <p className={`caption font-medium ${t.textMuted}`}>
                  {photoUrls.length ? `Tambah foto (${photoUrls.length}/${MAX_PHOTOS})` : 'Pamerkan hasil masakanmu'}
                </p>
              </div>
            </button>
          )}
        </div>

        {/* MAU DIAPAIN */}
        <div className="grid grid-cols-2 gap-2">
          {[
            ['eat', Utensils, 'Makan Sekarang'],
            ['prep', Refrigerator, 'Meal Prep'],
          ].map(([id, Icon, title]) => (
            <button key={id} onClick={() => setMode(id)}
              className={`rounded-3xl border p-4 text-left transition-all ${mode === id ? `${t.borderAccent} ${t.bgAccentSoft}` : `${t.border} ${t.bgCard}`}`}>
              <Icon size={20} className={mode === id ? t.textAccent : t.textMuted} />
              <p className={`h2 mt-2 ${t.textMain}`}>{title}</p>
            </button>
          ))}
        </div>

        {mode === 'eat' && (
          <div className={`rounded-3xl border ${t.border} ${t.bgCard} p-4`}>
            <p className={`h3 mb-2 ${t.textMuted}`}>Dimakan sebagai sesi apa?</p>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
              {MEAL_SESSIONS.filter((s) => s.id !== 'drink').map((s) => (
                <button key={s.id} onClick={() => setSessionId(s.id)}
                  className={`shrink-0 px-3 py-2 rounded-xl border caption ${sessionId === s.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
            <p className={`caption font-medium mt-3 ${t.textMuted}`}>
              1 porsi ({Math.round(recipe.perPortion?.kcal || 0)} kkal) dicatat sebagai sudah dimakan.
              {servings > 1 && ` ${servings - 1} porsi sisanya masuk stok Meal Prep.`}
            </p>
          </div>
        )}

        {mode === 'prep' && (
          <div className={`rounded-3xl border ${t.border} ${t.bgCard} p-4`}>
            <p className={`h3 mb-2 ${t.textMuted}`}>Simpan di:</p>
            <div className="flex gap-1.5 items-start">
              <button onClick={() => { setLocationId(''); setDomusOpen(false); }}
                className={`px-3 py-2 rounded-xl border caption ${!locationId ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                Lomeal
              </button>

              {domusLocations?.length > 0 && (
                <div className="relative flex-1">
                  <button onClick={() => setDomusOpen((v) => !v)}
                    className={`w-full px-3 py-2 rounded-xl border caption flex items-center justify-between gap-2 ${locationId ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                    <span className="truncate">
                      Domus{locationId ? ` · ${domusLocations.find((l) => l.id === locationId)?.name || ''}` : ''}
                    </span>
                    <ChevronDown size={14} className={`shrink-0 transition-transform ${domusOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {domusOpen && (
                    <div className={`absolute z-20 top-full mt-1 w-full rounded-2xl border ${t.border} ${isDark ? 'bg-[#0f1a14]' : 'bg-white'} shadow-lg overflow-hidden`}>
                      {domusLocations.map((loc) => (
                        <button key={loc.id} onClick={() => { setLocationId(loc.id); setDomusOpen(false); }}
                          className={`w-full px-3 py-2.5 text-left caption ${locationId === loc.id ? t.textAccent : t.textMain}`}>
                          {loc.emoji} {loc.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {photoUrls.length > 0 && (
          <button onClick={() => onShare?.({ photoUrl: photoUrls[0], photoUrls })}
            className={`w-full py-3 rounded-2xl border ${t.border} ${t.btnBg} ${t.textMain} body-md flex items-center justify-center gap-2`}>
            <Share2 size={16} /> Bagikan ke Social Feed
          </button>
        )}
      </div>

      <div className={`${bottomBar} flex gap-2`}>
        <button onClick={() => setFinishing(false)}
          className={`px-5 py-3.5 rounded-2xl border ${t.border} ${t.btnBg} ${t.textMain} body-md`}>Kembali</button>
        <button onClick={finish} disabled={saving}
          className={`flex-1 py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-50 flex items-center justify-center gap-2`}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Simpan
        </button>
      </div>
    </div>
  );

  // ============ LAYAR MASAK ============
  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto ${isDark ? 'bg-[#070a08]' : 'app-bg-light'}`}>
      <div className={`sticky top-0 z-10 pt-safe px-4 pb-3 ${isDark ? 'bg-[#070a08]/90' : 'bg-[#f0f7f2]/90'} backdrop-blur-xl`}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={close} className={`w-9 h-9 shrink-0 rounded-full ${t.btnBg} ${t.textMain} flex items-center justify-center`}><X size={17} /></button>
          <div className="flex-1 min-w-0">
            <p className={`h2 truncate ${t.textMain}`}>{recipe.name}</p>
            <p className={`caption font-medium ${t.textMuted}`}>{servings} porsi · {doneCount}/{totalSteps || '—'} langkah</p>
          </div>
        </div>

        {/* CHIP TIMER — bisa lebih dari satu, jalan barengan */}
        {timers.length > 0 && (
          <div className="max-w-2xl mx-auto flex gap-2 overflow-x-auto hide-scrollbar mt-3">
            {timers.map((tm) => {
              const left = remainingSec(tm);
              const ringing = left === 0;
              return (
                <button key={tm.id} onClick={() => removeTimer(tm.id)}
                  className={`shrink-0 rounded-2xl px-4 py-2 border text-left transition-all ${
                    ringing ? `${STATUS.warn.bg} ${STATUS.warn.border} text-white animate-pulse` : `${t.bgCard} ${t.border}`}`}>
                  <p className={`caption font-medium truncate max-w-[110px] ${ringing ? 'text-white' : t.textMuted}`}>{tm.label}</p>
                  <p className={`h2 tabular-nums ${ringing ? 'text-white' : t.textAccent}`}>
                    {ringing ? 'Matang!' : formatClock(left)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-40 space-y-4">
        <PillTabs t={t} theme={theme} value={tab} onChange={setTab}
          tabs={[['bahan', `Bahan (${recipe.ingredients.length})`], ['langkah', `Langkah (${totalSteps})`]]} />

        {tab === 'bahan' && (
          <div className="space-y-0.5">
            {recipe.ingredients.map((ing, i) => {
              const key = `ing_${i}`;
              const on = done.has(key);
              return (
                <button key={key} onClick={() => toggleDone(key)} className="w-full flex items-center gap-3 py-2.5 text-left">
                  <span className={`flex-1 body-md ${on ? `line-through ${t.textMuted}` : t.textMain}`}>{ing.name}</span>
                  <span className={`caption font-medium tabular-nums ${t.textMuted}`}>{Math.round((ing.grams || 0) * factor)} g</span>
                  <CheckBox t={t} checked={on} />
                </button>
              );
            })}
          </div>
        )}

        {tab === 'langkah' && (
          <div className="space-y-2.5">
            {components.length === 0 && (
              <div className={`rounded-3xl border-2 border-dashed ${t.borderDashed} p-6 text-center`}>
                <ChefHat size={26} className={`mx-auto mb-2 ${t.textMuted}`} />
                <p className={`caption font-medium ${t.textMuted}`}>Resep ini belum punya langkah. Masak sesuai selera, lalu tekan Selesai Masak.</p>
              </div>
            )}

            {components.map((c, ci) => {
              const compDone = c.steps.filter((s) => done.has(s.id)).length;
              const allDone = compDone === c.steps.length;
              const open = openComp === c.id;
              return (
                <div key={c.id} className={`rounded-3xl border ${allDone ? t.borderAccentSoft : t.border} ${t.bgCard} overflow-hidden`}>
                  <button onClick={() => setOpenComp(open ? null : c.id)} className="w-full flex items-center gap-3 p-4 text-left">
                    <span className={`w-8 h-8 shrink-0 rounded-xl caption flex items-center justify-center ${allDone ? 'bg-green-500 text-white' : `${t.bgAccentSoft} ${t.textAccent}`}`}>
                      {allDone ? <Check size={14} strokeWidth={3} /> : ci + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`h2 truncate ${t.textMain}`}>{c.name || `Komponen ${ci + 1}`}</p>
                      <p className={`caption font-medium ${t.textMuted}`}>{compDone}/{c.steps.length} langkah</p>
                    </div>
                    <ChevronDown size={16} className={`${t.textMuted} transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>

                  {open && (
                    <div className="px-4 pb-4 space-y-2">
                      {c.steps.map((s, si) => {
                        const on = done.has(s.id);
                        return (
                          <div key={s.id} className={`rounded-2xl border ${t.border} ${t.bgSunken} p-4 ${on ? 'opacity-55' : ''}`}>
                            <button onClick={() => toggleDone(s.id)} className="w-full flex items-start gap-3 text-left">
                              <span className="mt-0.5"><CheckBox t={t} checked={on} /></span>
                              <div className="flex-1">
                                <p className={`h3 mb-1 ${t.textMuted}`}>Langkah {si + 1}</p>
                                <p className={`body-md ${on ? `line-through ${t.textMuted}` : t.textMain}`}>{s.text}</p>
                              </div>
                            </button>
                            {s.photoUrl && <img src={s.photoUrl} alt="" className="w-full h-32 object-cover rounded-xl mt-3" />}
                            {s.timerSec > 0 && (
                              <button onClick={() => addTimer(c.name || `Komponen ${ci + 1}`, s.timerSec)}
                                className={`mt-3 w-full py-2.5 rounded-xl ${t.bgAccentSoft} border ${t.borderAccentSoft} ${t.textAccent} caption flex items-center justify-center gap-2 active:scale-[0.98] transition-transform`}>
                                <Timer size={14} /> Mulai timer {formatClock(s.timerSec)}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={bottomBar}>
        <button onClick={() => setFinishing(true)}
          className={`w-full max-w-2xl mx-auto py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow flex items-center justify-center gap-2`}>
          <Check size={18} /> Selesai Masak
        </button>
      </div>
    </div>
  );
};

export default CookingSession;
