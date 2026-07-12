// src/pages/SettingsPage.jsx — port struktur 3-tab dari lyfit.app/src/modals/SettingsModal.jsx
// (Preferensi/FAQ/Lanjutan), diadaptasi untuk Lomeal. Field yang dilewati (Jarak km/mi,
// Apple Health, Kepribadian/Memori AI Coach BELUM punya chat-consumer) dijelaskan inline.
import React, { useState, useEffect } from 'react';
import {
  X, Moon, Sun, Globe, Volume2, VolumeX, Timer, Download, Upload, CalendarDays,
  Bell, BellOff, Clock, Activity, Scale, Ruler, Thermometer, Trash2, Plus,
  MessageCircle, Brain, HelpCircle, ChevronDown, Copy, Lock,
} from 'lucide-react';
import { getLang } from '../i18n';

const FAQ_ITEMS_ID = [
  { q: 'Bagaimana cara sinkronisasi data antar HP dan laptop?', a: 'Cukup login pakai akun Google yang sama di semua perangkat. Data otomatis tersinkron lewat cloud dalam hitungan detik.' },
  { q: 'Kenapa fitur AI (scan foto/Magic Prompt) tidak bisa dipakai?', a: 'Perlu API Key Gemini dulu — isi di tab Lanjutan bawah ini. Kalau kamu sudah pakai Logym dan sudah isi API key di sana, tinggal klik "Salin ke Lomeal", tidak perlu isi ulang.' },
  { q: 'Bagaimana cara menambah bahan makanan yang tidak ada di Database?', a: 'Buka tab Database, klik "+ Tambah Bahan", isi manual atau foto label gizi kemasan (AI akan baca otomatis).' },
  { q: 'Apa itu Smart Warning?', a: 'Peringatan otomatis (kuning/merah) di Dashboard kalau asupan natrium/gula/kolesterol/purin mendekati atau melewati batas harian. Berjalan offline, tanpa AI.' },
  { q: 'Bagaimana cara membuat resep sendiri?', a: 'Buka tab Resep, buat resep dari bahan-bahan di Database, lalu bisa dijadwalkan otomatis ke Meal Prep di Kalender.' },
  { q: 'Apa bedanya Evaluasi Mingguan dengan Smart Warning?', a: 'Smart Warning otomatis & instan (logika lokal). Evaluasi Mingguan cuma jalan kalau kamu pencet tombolnya sendiri di tab Histori — AI menulis 1 paragraf umpan balik dari data 7 hari terakhir.' },
  { q: 'Bagaimana cara pakai fitur Social Hub?', a: 'Klik ikon avatar di pojok kanan atas. Kalau belum tersambung, klik "Hubungkan ke Logym" dulu di tab Profil — abis itu bisa posting, follow, dan lihat feed gabungan Lomeal+Logym.' },
  { q: 'Data saya aman gak kalau ganti HP?', a: 'Aman — sinkron otomatis lewat akun. Kamu juga bisa backup manual (export/import JSON) di tab Lanjutan.' },
  { q: 'Bisa gak lacak air minum?', a: 'Bisa — di tab Catat ada ikon gelas air, tap buat +200ml, atau tap ikon pensil buat input angka presisi.' },
  { q: 'Bagaimana cara ganti tema, bahasa, atau satuan?', a: 'Semua ada di tab Preferensi ini.' },
];

const FAQ_ITEMS_EN = [
  { q: 'How do I sync data across my phone and laptop?', a: 'Just log in with the same Google account on all devices. Data syncs automatically via the cloud within seconds.' },
  { q: "Why can't I use the AI features (photo scan/Magic Prompt)?", a: 'You need a Gemini API Key first — set it up in the Advanced tab below. If you already use Logym and have a key there, just click "Copy to Lomeal" — no need to re-enter it.' },
  { q: 'How do I add a food item not in the Database?', a: 'Open the Database tab, tap "+ Add Ingredient", fill it in manually or photograph a packaged nutrition label (AI reads it automatically).' },
  { q: 'What is Smart Warning?', a: 'Automatic warnings (yellow/red) on the Dashboard when sodium/sugar/cholesterol/purine intake nears or exceeds the daily limit. Runs offline, no AI needed.' },
  { q: 'How do I create my own recipe?', a: 'Open the Recipes tab, build a recipe from Database ingredients, then optionally schedule it to Meal Prep on the Calendar.' },
  { q: "What's the difference between Weekly Evaluation and Smart Warning?", a: 'Smart Warning is automatic and instant (local logic). Weekly Evaluation only runs when you tap the button yourself in the History tab — AI writes one feedback paragraph from your last 7 days of data.' },
  { q: 'How do I use the Social Hub?', a: 'Tap the avatar icon in the top-right corner. If not connected yet, tap "Connect to Logym" first in the Profile tab — then you can post, follow, and see a combined Lomeal+Logym feed.' },
  { q: 'Is my data safe if I switch phones?', a: 'Yes — it syncs automatically via your account. You can also manually back up (export/import JSON) in the Advanced tab.' },
  { q: 'Can I track water intake?', a: 'Yes — in the Log tab there\'s a water glass icon, tap for +200ml, or tap the pencil icon to enter a precise number.' },
  { q: 'How do I change theme, language, or units?', a: 'All in this Preferences tab.' },
];

const AI_PERSONAS = [
  { key: 'santai', emoji: '😄', label: 'Santai' },
  { key: 'tegas', emoji: '💪', label: 'Tegas' },
  { key: 'empatik', emoji: '🤗', label: 'Empatik' },
];

const Toggle2 = ({ leftLabel, rightLabel, leftActive, onLeft, onRight, t, leftIcon: LeftIcon, rightIcon: RightIcon }) => (
  <div className={`relative flex w-32 p-1 rounded-full ${t.btnBg} shrink-0`}>
    <div
      className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out ${t.bgAccent} shadow-sm`}
      style={{ transform: leftActive ? 'translateX(0)' : 'translateX(100%)', left: '4px' }}
    />
    <button onClick={onLeft} className={`flex flex-1 justify-center items-center py-1.5 rounded-full relative z-10 text-xs font-bold transition-colors duration-300 ${leftActive ? 'text-white' : t.textMuted}`}>
      {LeftIcon ? <LeftIcon size={16} /> : leftLabel}
    </button>
    <button onClick={onRight} className={`flex flex-1 justify-center items-center py-1.5 rounded-full relative z-10 text-xs font-bold transition-colors duration-300 ${!leftActive ? 'text-white' : t.textMuted}`}>
      {RightIcon ? <RightIcon size={16} /> : rightLabel}
    </button>
  </div>
);

const Row = ({ icon: Icon, label, t, children, first }) => (
  <div className={`flex justify-between items-center py-2 ${first ? '' : 'border-t border-black/5 dark:border-white/5'}`}>
    <div className={`flex items-center space-x-3 ${t.textMain} shrink-0`}>
      <Icon size={20} className={t.textAccent} />
      <span className="font-bold text-sm">{label}</span>
    </div>
    {children}
  </div>
);

const Section = ({ title, icon: Icon, t, children }) => (
  <div className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-2`}>
    {title && (
      <p className={`body-md ${t.textMuted} uppercase tracking-wider mb-2 flex items-center gap-2`}>
        {Icon && <Icon size={16} />} {title}
      </p>
    )}
    {children}
  </div>
);

const SettingsPage = ({
  t, theme, settings = {}, updateSetting, logymUser, logymApiKeys = [],
  onClose, onLogout, showAlert, showConfirm,
  exportData, handleImportFile,
  onToggleHealthConnect, healthConnected, healthAvailable,
  onDeleteAccount,
}) => {
  const [activeTab, setActiveTab] = useState('preferensi');
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const language = settings.language || 'ID';
  const lang = getLang(language);
  const faqItems = language === 'EN' ? FAQ_ITEMS_EN : FAQ_ITEMS_ID;
  const units = settings.units || {};
  const userApiKeys = settings.userApiKeys || [];

  return (
    <div className={`fixed inset-0 z-[999] ${t.bgApp} flex flex-col animate-in slide-in-from-bottom-full duration-300`}>
      <div className={`relative px-4 pt-4 pb-4 border-b ${t.border} shrink-0 flex items-center justify-between`}>
        <h1 className={`text-2xl font-black ${t.textMain} tracking-tight`}>{lang.settings}</h1>
        <button onClick={onClose} className={`p-2 rounded-full ${t.btnBg}`}>
          <X size={20} className={t.textMain} />
        </button>
      </div>

      <div className={`flex border-b ${t.border} px-2 shrink-0 overflow-x-auto hide-scrollbar`}>
        {[['preferensi', lang.tabPreferensi], ['faq', lang.tabFaq], ['lanjutan', lang.tabLanjutan]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-3 text-sm font-bold border-b-2 whitespace-nowrap px-4 transition-colors ${activeTab === id ? `${t.borderAccent} ${t.textMain}` : `border-transparent ${t.textMuted}`}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === 'preferensi' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Section t={t}>
              <Row icon={theme === 'dark' ? Moon : Sun} label={lang.theme} t={t} first>
                <Toggle2 t={t} leftIcon={Moon} rightIcon={Sun} leftActive={theme === 'dark'}
                  onLeft={() => updateSetting('theme', 'dark')} onRight={() => updateSetting('theme', 'light')} />
              </Row>
              <Row icon={Globe} label={lang.lang} t={t}>
                <Toggle2 t={t} leftLabel="ID" rightLabel="EN" leftActive={language === 'ID'}
                  onLeft={() => updateSetting('language', 'ID')} onRight={() => updateSetting('language', 'EN')} />
              </Row>
              <Row icon={settings.soundEnabled ? Volume2 : VolumeX} label={lang.sound} t={t}>
                <Toggle2 t={t} leftIcon={Volume2} rightIcon={VolumeX} leftActive={!!settings.soundEnabled}
                  onLeft={() => updateSetting('soundEnabled', true)} onRight={() => updateSetting('soundEnabled', false)} />
              </Row>
              <Row icon={CalendarDays} label={lang.weekStart} t={t}>
                <Toggle2 t={t} leftLabel={lang.monday} rightLabel={lang.sunday} leftActive={settings.weekStartDay !== 0}
                  onLeft={() => updateSetting('weekStartDay', 1)} onRight={() => updateSetting('weekStartDay', 0)} />
              </Row>
            </Section>

            <p className={`body-md ${t.textMuted} uppercase tracking-wider pt-2`}>{lang.unitSection}</p>
            <Section t={t}>
              <Row icon={Scale} label={lang.weight} t={t} first>
                <Toggle2 t={t} leftLabel="Kg" rightLabel="Lbs" leftActive={units.weight !== 'lbs'}
                  onLeft={() => updateSetting('units', { ...units, weight: 'kg' })}
                  onRight={() => updateSetting('units', { ...units, weight: 'lbs' })} />
              </Row>
              <Row icon={Ruler} label={lang.height} t={t}>
                <Toggle2 t={t} leftLabel="Cm" rightLabel="Ft/In" leftActive={units.height !== 'ft'}
                  onLeft={() => updateSetting('units', { ...units, height: 'cm' })}
                  onRight={() => updateSetting('units', { ...units, height: 'ft' })} />
              </Row>
              <Row icon={Thermometer} label={lang.temperature} t={t}>
                <Toggle2 t={t} leftLabel="°C" rightLabel="°F" leftActive={units.temp !== 'f'}
                  onLeft={() => updateSetting('units', { ...units, temp: 'c' })}
                  onRight={() => updateSetting('units', { ...units, temp: 'f' })} />
              </Row>
              <Row icon={Activity} label={lang.bmiStandard} t={t}>
                <Toggle2 t={t} leftLabel={lang.asia} rightLabel={lang.western} leftActive={settings.biometricStandard !== 'western'}
                  onLeft={() => updateSetting('biometricStandard', 'asia')}
                  onRight={() => updateSetting('biometricStandard', 'western')} />
              </Row>
            </Section>
          </div>
        )}

        {activeTab === 'faq' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Section title={lang.faqTitle} icon={HelpCircle} t={t}>
              <div className="space-y-1">
                {faqItems.map((item, i) => (
                  <div key={i} className={i === 0 ? '' : 'border-t border-black/5 dark:border-white/5'}>
                    <button onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)} className="w-full flex items-center justify-between gap-3 py-3 text-left">
                      <span className={`font-bold text-sm ${t.textMain}`}>{item.q}</span>
                      <ChevronDown size={16} className={`shrink-0 ${t.textMuted} transition-transform duration-200 ${openFaqIndex === i ? 'rotate-180' : ''}`} />
                    </button>
                    {openFaqIndex === i && (
                      <p className={`text-xs ${t.textMuted} leading-relaxed pb-3 pr-6 animate-in fade-in duration-200`}>{item.a}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'lanjutan' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* API UNTUK AI */}
            <Section title={lang.apiSection} icon={Activity} t={t}>
              <div className="space-y-2">
                {userApiKeys.map((key, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="password"
                      value={key}
                      onChange={(e) => {
                        const next = [...userApiKeys];
                        next[index] = e.target.value;
                        updateSetting('userApiKeys', next);
                      }}
                      placeholder={lang.apiPlaceholder}
                      autoComplete="new-password"
                      className={`flex-1 font-mono text-sm px-4 py-2.5 rounded-xl outline-none border ${t.border} ${t.inputBg} ${t.textMain}`}
                    />
                    <button
                      onClick={() => updateSetting('userApiKeys', userApiKeys.filter((_, i) => i !== index))}
                      className={`p-2.5 rounded-xl ${t.btnBg} text-rose-500 shrink-0`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => updateSetting('userApiKeys', [...userApiKeys, ''])}
                  className={`w-full py-2.5 rounded-xl border border-dashed ${t.borderDashed} ${t.btnBg} ${t.textMain} font-bold text-sm flex items-center justify-center gap-2`}
                >
                  <Plus size={16} /> {lang.addApiKey}
                </button>
                <p className={`text-[10px] ${t.textMuted} leading-tight`}>{lang.apiHint}</p>
                <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 text-xs font-bold ${t.textAccent}`}>
                  Ambil API Key Gemini gratis →
                </a>
              </div>

              {logymUser && logymApiKeys.length > 0 && (
                <div className={`mt-3 pt-3 border-t ${t.border} space-y-2`}>
                  <p className={`text-[10px] font-black uppercase tracking-wider ${t.textMuted} flex items-center gap-1.5`}>
                    <Lock size={10} /> {lang.fromLogym}
                  </p>
                  {logymApiKeys.map((key, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`flex-1 font-mono text-sm px-4 py-2.5 rounded-xl border ${t.border} ${t.bgSunken} ${t.textMuted}`}>
                        {'•'.repeat(Math.min(24, key.length))}
                      </div>
                      <button
                        onClick={() => { updateSetting('userApiKeys', [...userApiKeys, key]); showAlert?.('Kunci disalin ke Lomeal.'); }}
                        className={`p-2.5 rounded-xl ${t.bgAccentSoft} ${t.textAccent} shrink-0`}
                        title={lang.copyToLomeal}
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* KEPRIBADIAN & MEMORI AI COACH — settings disiapkan, chat interface menyusul pass terpisah */}
            <Section title={lang.aiCoachPersonality} icon={MessageCircle} t={t}>
              <div className="grid grid-cols-3 gap-2">
                {AI_PERSONAS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => updateSetting('aiCoachPersona', p.key)}
                    className={`py-3 rounded-xl transition-all flex flex-col items-center gap-1 ${settings.aiCoachPersona === p.key ? `${t.bgAccent} shadow-sm` : t.btnBg}`}
                  >
                    <span className="text-2xl">{p.emoji}</span>
                    <span className={`text-[10px] font-bold ${settings.aiCoachPersona === p.key ? 'text-white' : t.textMuted}`}>{p.label}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title={lang.aiCoachMemory} icon={Brain} t={t}>
              {(!settings.aiCoachMemory || settings.aiCoachMemory.length === 0) ? (
                <p className={`text-xs ${t.textMuted} leading-relaxed`}>{lang.aiCoachMemoryEmpty}</p>
              ) : (
                <div className="space-y-2">
                  {settings.aiCoachMemory.map((m, i) => (
                    <div key={i} className={`flex items-start gap-2 p-2.5 rounded-xl ${t.inputBg} border ${t.border}`}>
                      <p className={`flex-1 text-xs ${t.textMain} leading-relaxed`}>{m}</p>
                      <button
                        onClick={() => updateSetting('aiCoachMemory', settings.aiCoachMemory.filter((_, idx) => idx !== i))}
                        className="p-1 rounded-full text-rose-400 shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* PENGINGAT CATAT MAKAN */}
            <Section title={lang.reminderSection} icon={Clock} t={t}>
              <Row icon={Clock} label={lang.reminderTime} t={t} first>
                <input
                  type="time"
                  value={settings.reminderTime || '19:00'}
                  onChange={(e) => updateSetting('reminderTime', e.target.value)}
                  className={`w-32 text-center font-bold px-2 py-1.5 rounded-xl outline-none border ${t.border} ${t.inputBg} ${t.textMain}`}
                />
              </Row>
              <Row icon={settings.reminderEnabled ? Bell : BellOff} label={lang.reminderToggle} t={t}>
                <Toggle2 t={t} leftIcon={BellOff} rightIcon={Bell} leftActive={!settings.reminderEnabled}
                  onLeft={() => updateSetting('reminderEnabled', false)} onRight={() => updateSetting('reminderEnabled', true)} />
              </Row>
            </Section>

            {/* KONEKSI DATA KESEHATAN */}
            <Section title={lang.healthSection} icon={Activity} t={t}>
              <div className="flex items-center justify-between">
                <span className={`font-bold text-sm ${t.textMain}`}>{lang.healthConnect}</span>
                <button
                  onClick={onToggleHealthConnect}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${healthConnected ? `${t.bgAccent} text-white shadow-sm` : `${t.btnBg} ${t.textMuted}`}`}
                >
                  {healthConnected ? lang.connected : lang.connect}
                </button>
              </div>
              {!healthAvailable && (
                <p className={`text-[10px] ${t.textMuted} leading-tight`}>Aktif di aplikasi Android (Capacitor) — belum tersedia di browser web.</p>
              )}
            </Section>

            {/* BACKUP & RESTORE */}
            <Section title={lang.backupSection} icon={Download} t={t}>
              <div className="flex space-x-3">
                <button onClick={exportData} className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl font-bold ${t.btnBg} ${t.textMain} border ${t.border} active:scale-95 transition-all`}>
                  <Download size={16} /> <span>{lang.export}</span>
                </button>
                <label className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl font-bold ${t.btnBg} ${t.textMain} cursor-pointer border ${t.border} active:scale-95 transition-all`}>
                  <Upload size={16} /> <span>{lang.import}</span>
                  <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
                </label>
              </div>
            </Section>

            {/* ZONA BERBAHAYA */}
            <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 space-y-3 mt-8">
              <p className="body-md text-rose-500 font-bold uppercase tracking-wider mb-2">{lang.dangerZone}</p>
              <p className={`text-[10px] ${t.textMuted} leading-tight`}>{lang.dangerZoneDesc}</p>
              <button
                onClick={async () => {
                  if (await showConfirm(lang.dangerZoneDesc, { title: lang.deleteAccount, confirmText: lang.deleteAccount, danger: true })) {
                    if (await showConfirm('Konfirmasi terakhir — beneran hapus akun sekarang?', { danger: true })) {
                      onDeleteAccount();
                    }
                  }
                }}
                className="w-full py-3 rounded-xl font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 text-sm active:scale-95 transition-all mt-2"
              >
                {lang.deleteAccount}
              </button>
            </div>

            <button onClick={onLogout} className={`w-full py-3 rounded-2xl bg-rose-500 text-white font-bold`}>
              {lang.logout}
            </button>
          </div>
        )}

        <div className="py-6 text-center">
          <p className={`text-[10px] font-bold ${t.textMuted} uppercase tracking-widest`}>LOMEAL App v0.1.0</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
