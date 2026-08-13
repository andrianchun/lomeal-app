import React, { useState, useEffect } from 'react';
import { X, Camera, Send, Loader2, Check } from 'lucide-react';
import { MEAL_SESSIONS } from '../data/constants';
import { makeEntry } from '../utils/foodLog';
import { runLocalNlpParse } from '../utils/nlpParser';

const InboxProcessor = ({ t, theme, item, onClose, onSaveToLog, onSaveToDomus, onNutritionSaved }) => {
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

  const handleParse = async () => {
    setLoading(true);
    try {
      const res = await runLocalNlpParse(item.text, '', false);
      let nutrition;
      if (res && res.foods && res.foods.length > 0) {
        nutrition = {
          kcal: res.foods.reduce((acc, curr) => acc + (curr.nutrition?.kcal || curr.kcal || 0), 0),
          protein: res.foods.reduce((acc, curr) => acc + (curr.nutrition?.protein || curr.protein || 0), 0),
          carbs: res.foods.reduce((acc, curr) => acc + (curr.nutrition?.carbs || curr.carbs || 0), 0),
          fat: res.foods.reduce((acc, curr) => acc + (curr.nutrition?.fat || curr.fat || 0), 0),
        };
      } else {
        nutrition = { kcal: 450, protein: 20, carbs: 50, fat: 15 }; // fallback
      }

      const parsed = { name: item.text, grams: 1, unit: 'porsi', nutrition };
      setParsedData(parsed);
      setStep(2);

      // Autosave nutrition back to Firestore
      if (onNutritionSaved) {
        onNutritionSaved(nutrition).catch(e => console.error('Nutrition autosave fail', e));
      }
    } catch (e) {
      console.error(e);
      const fallback = { kcal: 450, protein: 20, carbs: 50, fat: 15 };
      setParsedData({ name: item.text, grams: 1, unit: 'porsi', nutrition: fallback });
      setStep(2);
      if (onNutritionSaved) {
        onNutritionSaved(fallback).catch(() => {});
      }
    }
    setLoading(false);
  };

  const handleEatNow = () => {
    const isDrink = item.text.toLowerCase().includes('coca') || item.text.toLowerCase().includes('es teh') || item.text.toLowerCase().includes('kopi');
    const entry = makeEntry({
      name: parsedData.name,
      grams: isDrink ? 250 : parsedData.grams,
      unit: isDrink ? 'ml' : 'porsi',
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
            
            <button disabled={loading} onClick={handleParse}
              className={`w-full py-3.5 mt-2 rounded-2xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50`}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Hitung Nutrisi AI
            </button>
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
            <button onClick={() => { setStep(1); setParsedData(null); }} className={`w-full py-2 rounded-xl border ${t.border} ${t.textMuted} caption font-bold`}>
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
