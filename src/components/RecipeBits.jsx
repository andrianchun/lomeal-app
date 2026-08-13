import React from 'react';
import { Check } from 'lucide-react';

// Dua potongan UI yang muncul di ketiga layar resep (detail, builder, sesi masak).
// Ditaruh di satu tempat supaya tab dan kotak centangnya tidak pelan-pelan jadi beda
// ukuran/warna di tiap layar — persis masalah yang bikin tampilannya terasa acak.

/** Tab pil — bentuk & warnanya disamakan dengan sub-tab di ProgramTab/FoodDbTab. */
export const PillTabs = ({ t, theme, tabs, value, onChange }) => (
  <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'}`}>
    {tabs.map(([id, label]) => (
      <button key={id} onClick={() => onChange(id)}
        className={`flex-1 py-2 rounded-xl caption transition-all ${value === id ? `${t.bgCard} shadow-sm ${t.textAccent}` : t.textMuted}`}>
        {label}
      </button>
    ))}
  </div>
);

/** Kotak centang 20px, warna aksen tema (hijau), dipakai untuk bahan & langkah. */
export const CheckBox = ({ t, checked }) => (
  <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
    checked ? 'bg-green-500 border-green-500 text-white' : `${t.border} ${t.inputBg}`}`}>
    {checked && <Check size={12} strokeWidth={3} />}
  </span>
);
