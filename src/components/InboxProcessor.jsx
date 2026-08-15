import React, { useState, useEffect } from 'react';
import { X, Camera, Send, Loader2, Check, Pencil } from 'lucide-react';
import { MEAL_SESSIONS, AI_DAILY_LIMIT } from '../data/constants';
import { makeEntry, checkAndCountAiUsage, refundAiUsage } from '../utils/foodLog';
import { runLocalNlpParse } from '../utils/nlpParser';
import { parseFoodText } from '../utils/aiFood';

const sumNutrition = (foods) => ({
  kcal: foods.reduce((a, f) => a + (f.nutrition?.kcal || f.kcal || 0), 0),
  protein: foods.reduce((a, f) => a + (f.nutrition?.protein || f.protein || 0), 0),
  carbs: foods.reduce((a, f) => a + (f.nutrition?.carbs || f.carbs || 0), 0),
  fat: foods.reduce((a, f) => a + (f.nutrition?.fat || f.fat || 0), 0),
});

const InboxProcessor = ({ t, theme, item, user, aiKey, customFoods = [], todayYmd, showAlert, onClose, onSaveToLog, onSaveToDomus, onNutritionSaved, onParseFailed }) => {
  // If item already has nutrition (e.g. auto-parsed), skip to step 2
  const initialStep = (item.skipToStep2 && item.nutrition?.kcal) ? 2 : 1;
  const [step, setStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState(
    (item.nutrition?.kcal)
      ? { name: item.text, grams: 1, unit: 'porsi', nutrition: item.nutrition }
      : null
  );
  const [session, setSession] = useState('lunch');
  const [manual, setManual] = useState(null);

  const accept = (foods, isDrink) => {
    const nutrition = sumNutrition(foods);
    const first = foods[0] || {};
    setParsedData({
      name: item.text,
      grams: first.grams || 1,
      unit: first.unit || 'porsi',
      isDrink: isDrink ?? !!first.isDrink,
      nutrition,
    });
    setStep(2);
    onNutritionSaved?.(nutrition).catch((e) => console.error('Nutrition autosave fail', e));
  };

  // Tebakan gizi TIDAK BOLEH dikarang. Kalau parser lokal dan AI sama-sama gagal, item
  // ditandai gagal dan user mengisi manual — angka karangan sebelumnya ikut tersimpan ke
  // Firestore, jadi sebotol air tercatat permanen sebagai 450 kkal.
  const handleParse = async () => {
    setLoading(true);
    try {
      const local = runLocalNlpParse(item.text, customFoods);
      if (local?.foods?.length) return accept(local.foods);

      if (!aiKey && !user?.uid) return setManual({ kcal: '', protein: '', carbs: '', fat: '' });

      const quota = await checkAndCountAiUsage(user.uid, todayYmd, AI_DAILY_LIMIT);
      if (!quota.allowed) {
        showAlert?.(`Kuota Lomy harian habis (${AI_DAILY_LIMIT} request/hari). Isi manual dulu ya.`);
        return setManual({ kcal: '', protein: '', carbs: '', fat: '' });
      }
      try {
        const res = await parseFoodText(aiKey, item.text, null, customFoods);
        if (res?.foods?.length) return accept(res.foods);
        await refundAiUsage(user.uid);
      } catch (e) {
        await refundAiUsage(user.uid);
        if (e.message !== 'OUT_OF_SCOPE') console.error('Inbox AI parse fail', e);
      }
      onParseFailed?.();
      setManual({ kcal: '', protein: '', carbs: '', fat: '' });
    } catch (e) {
      console.error(e);
      onParseFailed?.();
      setManual({ kcal: '', protein: '', carbs: '', fat: '' });
    } finally {
      setLoading(false);
    }
  };

  const submitManual = () => {
    const nutrition = {
      kcal: Number(manual.kcal) || 0,
      protein: Number(manual.protein) || 0,
      carbs: Number(manual.carbs) || 0,
      fat: Number(manual.fat) || 0,
    };
    setManual(null);
    accept([{ nutrition }]);
  };

  const handleEatNow = () => {
    const isDrink = parsedData.isDrink;
    const entry = makeEntry({
      name: parsedData.name,
      grams: parsedData.grams,
      unit: parsedData.unit,
      nutrition: parsedData.nutrition,
      source: item.source || 'darka',
      isMealPrep: false,
      planned: false,
      isEaten: true,
      category: isDrink ? 'drink' : 'food'
    });
    onSaveToLog(session, entry);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-swipe" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]/95 backdrop-blur-xl' : 'bg-white/95 backdrop-blur-xl'} p-5 anim-rise flex flex-col`}>
        
        <div className="flex items-center justify-between mb-4">
          <h2 className={`h2 ${t.textMain}`}>Proses Inbox</h2>
          <button onClick={onClose} className={`p-1.5 rounded-xl ${t.btnBg} ${t.textMuted}`}><X size={16} /></button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border ${t.border} ${t.bgSunken}`}>
              <p className={`caption font-medium ${t.textMuted} mb-1`}>Isi dari Bon:</p>
              <p className={`body-lg font-bold ${t.textMain}`}>{item.text}</p>
            </div>
            
            <div className={`p-4 rounded-2xl border-2 border-dashed ${t.borderDashed} flex flex-col items-center justify-center gap-2 cursor-pointer ${t.bgSunken}`}>
              <Camera size={24} className={t.textMuted} />
              <p className={`caption text-center ${t.textMuted}`}>Tidak yakin? <span className="text-emerald-500 font-bold">Upload foto</span> untuk analisis yang lebih presisi (Opsional).</p>
            </div>
            
            {manual ? (
              <div className={`p-4 rounded-2xl border ${t.border} ${t.bgSunken} space-y-3`}>
                <div className={`flex items-center gap-2 caption font-bold ${t.textMuted}`}>
                  <Pencil size={14} /> Gizi belum ketemu — isi manual
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[['kcal', 'Kalori (kkal)'], ['protein', 'Protein (g)'], ['carbs', 'Karbo (g)'], ['fat', 'Lemak (g)']].map(([k, label]) => (
                    <label key={k} className={`caption ${t.textMuted}`}>
                      {label}
                      <input type="number" inputMode="decimal" min="0" value={manual[k]}
                        onChange={(e) => setManual({ ...manual, [k]: e.target.value })}
                        className={`w-full mt-1 px-3 py-2 rounded-xl border ${t.border} ${t.bgCard} ${t.textMain} text-sm`} />
                    </label>
                  ))}
                </div>
                <button onClick={submitManual}
                  className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-bold text-sm">
                  Pakai angka ini
                </button>
              </div>
            ) : (
              <button disabled={loading} onClick={handleParse}
                className={`w-full py-3.5 mt-2 rounded-2xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50`}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Hitung Nutrisi AI
              </button>
            )}
          </div>
        )}

        {step === 2 && parsedData && (
          <div className="space-y-5">
            <div className={`p-4 rounded-2xl border ${t.border} bg-emerald-500/10 border-emerald-500/30`}>
              <div className="flex items-center gap-2 mb-2 text-emerald-500">
                <Check size={18} />
                <span className="font-bold text-sm">Estimasi Gizi Selesai</span>
              </div>
              <p className={`h2 ${t.textMain} mb-2`}>{Math.round(parsedData.nutrition.kcal)} <span className="text-sm font-medium opacity-60">kkal</span></p>
              <div className="flex gap-4 caption font-medium">
                <span className={t.textMain}>{Math.round(parsedData.nutrition.protein)}g P</span>
                <span className={t.textMain}>{Math.round(parsedData.nutrition.carbs)}g K</span>
                <span className={t.textMain}>{Math.round(parsedData.nutrition.fat)}g L</span>
              </div>
            </div>

            {/* Recalculate button */}
            <button onClick={() => { setStep(1); setParsedData(null); setManual(null); }} className={`w-full py-2 rounded-xl border ${t.border} ${t.textMuted} caption font-bold`}>
              Hitung ulang nutrisi
            </button>

            <div>
              <p className={`caption font-bold mb-2 ${t.textMuted}`}>Pilih Sesi Konsumsi:</p>
              <div className="flex flex-wrap gap-2">
                {MEAL_SESSIONS.map(s => (
                  <button key={s.id} onClick={() => setSession(s.id)}
                    className={`px-3 py-2 rounded-xl border caption font-bold transition-all ${session === s.id ? `${t.bgAccentSoft} border-emerald-500 text-emerald-500` : `${t.border} ${t.textMuted}`}`}>
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {item.source !== 'domus' && (
                <button onClick={() => onSaveToDomus(parsedData)} className={`flex-1 py-3.5 rounded-2xl border ${t.border} ${t.textMuted} font-bold text-sm`}>
                  Simpan ke Domus
                </button>
              )}
              <button onClick={handleEatNow} className={`flex-[2] py-3.5 rounded-2xl bg-emerald-500 text-white font-bold text-sm shadow-glow`}>
                Makan Sekarang
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default InboxProcessor;
