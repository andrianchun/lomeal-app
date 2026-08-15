import React, { useMemo, useState, useEffect } from 'react';
import { FlaskConical, Plus, Camera, Loader2, X, Trash2, ShieldAlert, ChevronDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ReferenceArea, ResponsiveContainer, Tooltip } from 'recharts';
import { LAB_PANELS, LAB_MARKERS, findMarker, markerStatus, referenceText, LAB_DISCLAIMER } from '../data/labPanels';
import { AI_DAILY_LIMIT, getLocalYMD } from '../data/constants';
import { subscribeLabResults, saveLabResults, checkAndCountAiUsage, refundAiUsage } from '../utils/foodLog';
import { compressImageForAI, toDataUrl, extractLabResultsFromImage } from '../utils/aiFood';
import useBackClose from '../hooks/useBackClose';

const STATUS_COLOR = { low: 'text-sky-500', high: 'text-red-500', normal: 'text-emerald-500' };
const STATUS_LABEL = { low: 'di bawah rujukan', high: 'di atas rujukan', normal: 'dalam rujukan' };

/**
 * Kartu hasil laboratorium: catat manual atau pindai foto lembar hasil, lalu lihat trennya.
 *
 * Sengaja TIDAK menafsirkan apa pun. Warna cuma menandai posisi terhadap rentang rujukan
 * umum, dan tiap lab punya rentangnya sendiri — itu yang berlaku, bukan angka di sini.
 */
const LabResultsCard = ({ t, theme, user, aiKey, profile, saveProfilePatch, showAlert, showToast, showConfirm }) => {
  const [entries, setEntries] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expandedMarker, setExpandedMarker] = useState(null);

  const accepted = !!profile?.labDisclaimerAcceptedAt;

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeLabResults(user.uid, setEntries);
  }, [user?.uid]);

  useBackClose(!!editing, () => setEditing(null));

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.testDate || '').localeCompare(b.testDate || '')), [entries]);
  const latest = sorted[sorted.length - 1];

  // Penanda yang pernah punya nilai — tidak perlu menampilkan 17 baris kosong.
  const trackedMarkers = useMemo(
    () => LAB_MARKERS.filter((m) => sorted.some((e) => e.results?.[m.key] != null)),
    [sorted]
  );

  const persist = (items) => saveLabResults(user.uid, items);

  const openNew = () => setEditing({ id: `lab_${Date.now()}`, testDate: getLocalYMD(), labName: '', results: {} });

  const save = async () => {
    const clean = Object.fromEntries(
      Object.entries(editing.results).filter(([, v]) => v !== '' && v != null && Number.isFinite(Number(v)))
        .map(([k, v]) => [k, Number(v)])
    );
    if (Object.keys(clean).length === 0) return showAlert('Isi minimal satu nilai dulu ya.');
    const next = entries.some((e) => e.id === editing.id)
      ? entries.map((e) => (e.id === editing.id ? { ...editing, results: clean } : e))
      : [...entries, { ...editing, results: clean }];
    await persist(next);
    setEditing(null);
    showToast('Hasil lab tersimpan.');
  };

  const remove = async (id) => {
    if (!(await showConfirm('Hapus catatan hasil lab ini?', { title: 'Hapus', confirmText: 'Hapus', danger: true }))) return;
    await persist(entries.filter((e) => e.id !== id));
  };

  const scan = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const quota = await checkAndCountAiUsage(user.uid, getLocalYMD(), AI_DAILY_LIMIT);
      if (!quota.allowed) return showAlert(`Kuota Lomy harian habis (${AI_DAILY_LIMIT}/hari). Isi manual dulu ya.`);
      try {
        const dataUrl = await compressImageForAI(await toDataUrl(file));
        const base64 = dataUrl.split(',')[1];
        const res = await extractLabResultsFromImage(aiKey, base64, 'image/webp');
        if (Object.keys(res.results).length === 0) {
          await refundAiUsage(user.uid);
          return showAlert('Tidak ada nilai lab yang terbaca dari foto itu. Coba foto yang lebih jelas, atau isi manual.');
        }
        setEditing({
          id: `lab_${Date.now()}`,
          testDate: res.testDate || getLocalYMD(),
          labName: res.labName || '',
          results: res.results,
          fromOcr: true,
        });
      } catch (e) {
        await refundAiUsage(user.uid);
        showAlert(e.message === 'OUT_OF_SCOPE' ? 'Foto itu sepertinya bukan lembar hasil lab.' : `Gagal memindai: ${e.message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!accepted) {
    return (
      <div className={`rounded-3xl border ${t.border} ${t.bgCard} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical size={18} className="text-purple-500" />
          <h2 className={`h2 ${t.textMain}`}>Hasil Laboratorium</h2>
        </div>
        <div className={`flex gap-2 p-3 rounded-2xl ${t.bgSunken} mb-4`}>
          <ShieldAlert size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className={`caption ${t.textMuted} leading-relaxed`}>{LAB_DISCLAIMER}</p>
        </div>
        <button onClick={() => saveProfilePatch({ labDisclaimerAcceptedAt: Date.now() })}
          className={`w-full py-3 rounded-2xl ${t.bgAccent} body-lg`}>
          Saya mengerti, aktifkan
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl border ${t.border} ${t.bgCard} overflow-hidden`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5">
        <div className="flex items-center gap-2">
          <FlaskConical size={18} className="text-purple-500" />
          <h2 className={`h2 ${t.textMain}`}>Hasil Laboratorium</h2>
        </div>
        <div className="flex items-center gap-2">
          {latest && <span className={`caption ${t.textMuted}`}>{latest.testDate}</span>}
          <ChevronDown size={16} className={`${t.textMuted} transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className={`px-5 pb-5 space-y-4 border-t ${t.border} pt-4`}>
          {sorted.length === 0 && (
            <p className={`caption ${t.textMuted}`}>Belum ada catatan. Tambah manual atau pindai foto lembar hasil labmu.</p>
          )}

          {trackedMarkers.map((m) => {
            const value = latest?.results?.[m.key];
            const st = markerStatus(m.key, value);
            const series = sorted.filter((e) => e.results?.[m.key] != null)
              .map((e) => ({ date: (e.testDate || '').slice(5), value: e.results[m.key] }));
            const isOpen = expandedMarker === m.key;
            return (
              <div key={m.key}>
                <button onClick={() => setExpandedMarker(isOpen ? null : m.key)} className="w-full flex items-baseline justify-between py-1.5">
                  <span className={`body-md ${t.textMain}`}>{m.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className={`body-md font-bold tabular-nums ${STATUS_COLOR[st] || t.textMain}`}>
                      {value ?? '—'} <span className={`caption font-medium ${t.textMuted}`}>{m.unit}</span>
                    </span>
                    <span className={`caption ${t.textMuted}`}>({referenceText(m)})</span>
                  </span>
                </button>
                {isOpen && (
                  <div className={`rounded-2xl ${t.bgSunken} p-3 mb-2`}>
                    <p className={`caption mb-2 ${STATUS_COLOR[st] || t.textMuted}`}>
                      {st ? `Nilai terakhir ${STATUS_LABEL[st]} umum (${referenceText(m)}).` : 'Belum ada nilai.'} Rentang rujukan labmu sendiri yang berlaku — tanyakan ke dokter.
                    </p>
                    {series.length >= 2 ? (
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          {m.low != null && m.high != null && (
                            <ReferenceArea y1={m.low} y2={m.high} fill="#10b981" fillOpacity={0.12} />
                          )}
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke={theme === 'dark' ? '#666' : '#999'} />
                          <YAxis tick={{ fontSize: 10 }} stroke={theme === 'dark' ? '#666' : '#999'} domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                          <Line type="monotone" dataKey="value" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className={`caption ${t.textMuted}`}>Butuh minimal 2 pemeriksaan untuk melihat tren.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {sorted.length > 0 && (
            <div className={`pt-3 border-t ${t.border} space-y-1`}>
              {[...sorted].reverse().map((e) => (
                <div key={e.id} className="flex items-center justify-between">
                  <button onClick={() => setEditing({ ...e, results: { ...e.results } })} className={`caption ${t.textMuted} text-left`}>
                    {e.testDate} · {Object.keys(e.results).length} nilai {e.labName ? `· ${e.labName}` : ''}
                  </button>
                  <button onClick={() => remove(e.id)} className="p-1.5 text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={openNew} className={`flex-1 py-2.5 rounded-2xl border ${t.border} ${t.textMain} caption font-bold flex items-center justify-center gap-1.5`}>
              <Plus size={14} /> Catat Manual
            </button>
            <label className={`flex-1 py-2.5 rounded-2xl ${t.bgAccent} caption font-bold flex items-center justify-center gap-1.5 cursor-pointer ${busy ? 'opacity-60' : ''}`}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Pindai Foto
              <input type="file" accept="image/*" className="hidden" disabled={busy}
                onChange={(e) => { scan(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-swipe" onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm max-h-[85vh] overflow-y-auto hide-scrollbar rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0a1510]' : 'bg-white'} p-5 anim-rise`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`h2 ${t.textMain}`}>Hasil Lab</h2>
              <button onClick={() => setEditing(null)} className={`p-1.5 rounded-xl ${t.btnBg} ${t.textMuted}`}><X size={16} /></button>
            </div>

            {editing.fromOcr && (
              <p className={`caption text-amber-500 mb-3`}>Hasil pindai foto — cocokkan dulu dengan lembar aslinya sebelum disimpan.</p>
            )}

            <div className="grid grid-cols-2 gap-2 mb-4">
              <label className={`caption ${t.textMuted}`}>Tanggal Periksa
                <input type="date" value={editing.testDate || ''} onChange={(e) => setEditing({ ...editing, testDate: e.target.value })}
                  className={`w-full mt-1 px-3 py-2 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} text-sm`} />
              </label>
              <label className={`caption ${t.textMuted}`}>Nama Lab
                <input type="text" value={editing.labName || ''} onChange={(e) => setEditing({ ...editing, labName: e.target.value })}
                  className={`w-full mt-1 px-3 py-2 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} text-sm`} />
              </label>
            </div>

            {LAB_PANELS.map((panel) => (
              <div key={panel.id} className="mb-4">
                <p className={`caption font-bold mb-2 ${t.textMuted} uppercase tracking-wider`}>{panel.label}</p>
                <div className="space-y-2">
                  {panel.markers.map((m) => (
                    <label key={m.key} className="flex items-center gap-2">
                      <span className={`flex-1 caption ${t.textMain}`}>{m.label}</span>
                      <input type="number" inputMode="decimal" step="any" min="0"
                        value={editing.results[m.key] ?? ''}
                        onChange={(e) => setEditing({ ...editing, results: { ...editing.results, [m.key]: e.target.value } })}
                        className={`w-20 px-2 py-1.5 rounded-lg border ${t.border} ${t.inputBg} ${t.textMain} text-sm text-right tabular-nums`} />
                      <span className={`caption ${t.textMuted} w-14`}>{m.unit}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={save} className={`w-full py-3 rounded-2xl ${t.bgAccent} body-lg`}>Simpan</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabResultsCard;
