import React from 'react';
import { X, Check, Beaker, Pill, ShieldPlus, Syringe, Tablets } from 'lucide-react';

const ICONS = { Pill, Tablets, Beaker, Syringe, ShieldPlus };
const COLORS = [
  { id: 'sky', bg: 'bg-sky-500' },
  { id: 'blue', bg: 'bg-blue-500' },
  { id: 'indigo', bg: 'bg-indigo-500' },
  { id: 'purple', bg: 'bg-purple-500' },
  { id: 'pink', bg: 'bg-pink-500' },
  { id: 'rose', bg: 'bg-rose-500' },
  { id: 'orange', bg: 'bg-orange-500' },
  { id: 'amber', bg: 'bg-amber-600' },
  { id: 'emerald', bg: 'bg-emerald-500' },
  { id: 'zinc', bg: 'bg-zinc-600' },
];

const MedicineBuilder = ({ t, editing, setEditing, onSave }) => {
  const inputCls = `w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`;

  const CurrentIcon = ICONS[editing.icon] || Pill;

  const handleSave = () => {
    onSave({ ...editing });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-4 anim-rise">
      <div className="flex items-center justify-between">
        <h1 className={`h1 ${t.textMain}`}>Obat Baru</h1>
        <button onClick={() => setEditing(null)} className={`p-2 rounded-xl ${t.btnBg}`}><X size={16} className={t.textMuted} /></button>
      </div>

      <div className={`p-4 rounded-3xl flex items-center gap-4 border ${t.border} ${t.bgCard}`}>
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white ${COLORS.find(c => c.id === editing.color)?.bg || 'bg-zinc-500'}`}>
          <CurrentIcon size={32} />
        </div>
        <div className="flex-1">
          <input className={`${inputCls} !bg-transparent !border-b !rounded-none !px-0 !py-1 !text-xl font-black`} 
                 placeholder='Nama Obat (Amlodipin 5mg...)' value={editing.name}
                 onChange={(e) => setEditing(r => ({ ...r, name: e.target.value }))} />
        </div>
      </div>

      <div>
        <p className={`caption font-bold mb-2 ${t.textMuted}`}>Bentuk Sediaan</p>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
          {Object.keys(ICONS).map(iconName => {
            const IconComp = ICONS[iconName];
            const active = editing.icon === iconName;
            return (
              <button key={iconName} onClick={() => setEditing(r => ({ ...r, icon: iconName }))}
                className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center border transition-all ${active ? `${t.bgAccent} border-transparent text-white` : `${t.bgCard} ${t.border} ${t.textMuted}`}`}>
                <IconComp size={22} />
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className={`caption font-bold mb-2 ${t.textMuted}`}>Pilih Warna Penanda</p>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
          {COLORS.map(c => {
            const active = editing.color === c.id;
            return (
              <button key={c.id} onClick={() => setEditing(r => ({ ...r, color: c.id }))}
                className={`w-10 h-10 shrink-0 rounded-full border-2 transition-all ${c.bg} ${active ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`} />
            )
          })}
        </div>
      </div>

      <div className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-4`}>
        <div>
          <p className={`caption font-bold mb-1.5 ${t.textMuted}`}>Aturan Pakai (Signa)</p>
          <div className="flex gap-2">
            <input type="text" placeholder="Misal: 3x1" value={editing.signa} onChange={(e) => setEditing(r => ({ ...r, signa: e.target.value }))}
              className={`w-24 px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} font-bold text-center outline-none`} />
            <p className={`caption ${t.textMuted} flex-1 self-center`}>Contoh: 3x1 artinya diminum 3 kali sehari, tiap kali 1 pil/tablet.</p>
          </div>
        </div>
        
        <div>
          <p className={`caption font-bold mb-1.5 ${t.textMuted}`}>Catatan Tambahan (Opsional)</p>
          <input type="text" placeholder="Sesudah makan..." value={editing.note} onChange={(e) => setEditing(r => ({ ...r, note: e.target.value }))}
            className={`w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} outline-none text-sm`} />
        </div>
      </div>

      <button disabled={!editing.name || !editing.signa} onClick={handleSave}
        className={`w-full py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40 flex items-center justify-center gap-2`}>
        <Check size={18} /> Simpan ke Rak Obat
      </button>
    </div>
  );
};

export default MedicineBuilder;
