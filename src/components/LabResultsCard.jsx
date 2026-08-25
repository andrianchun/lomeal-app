import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newCustom, setNewCustom] = useState({ label: '', unit: '', low: '', high: '', val: '' });

  const accepted = !!profile?.labDisclaimerAcceptedAt;

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeLabResults(user.uid, setEntries);
  }, [user?.uid]);

  useBackClose(!!editing, () => setEditing(null));

  const customMarkers = useMemo(() => profile?.customLabMarkers || [], [profile?.customLabMarkers]);

  const allMarkers = useMemo(() => {
    return [...LAB_MARKERS, ...customMarkers.map((m) => ({ ...m, isCustom: true }))];
  }, [customMarkers]);

  const findAnyMarker = (key) => allMarkers.find((m) => m.key === key) || null;

  const getMarkerStatus = (key, value) => {
    const m = findAnyMarker(key);
    if (!m || value == null || value === '') return null;
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    if (m.low != null && v < m.low) return 'low';
    if (m.high != null && v > m.high) return 'high';
    return 'normal';
  };

  const getReferenceText = (m) => {
    if (!m) return '';
    if (m.low != null && m.high != null) return `${m.low}–${m.high} ${m.unit || ''}`.trim();
    if (m.high != null) return `< ${m.high} ${m.unit || ''}`.trim();
    if (m.low != null) return `> ${m.low} ${m.unit || ''}`.trim();
    return m.unit || '—';
  };

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.testDate || '').localeCompare(b.testDate || '')), [entries]);
  const latest = sorted[sorted.length - 1];

  // Penanda yang pernah punya nilai — termasuk penanda kustom
  const trackedMarkers = useMemo(
    () => allMarkers.filter((m) => sorted.some((e) => e.results?.[m.key] != null)),
    [allMarkers, sorted]
  );

  const persist = (items) => saveLabResults(user.uid, items);

  const openNew = () => setEditing({ id: `lab_${Date.now()}`, testDate: getLocalYMD(), labName: '', results: {} });

  const handleAddCustomMarker = () => {
    const label = newCustom.label.trim();
    if (!label) return showAlert('Nama parameter lab harus diisi.');
    const key = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const unit = newCustom.unit.trim() || 'satuan';
    const low = newCustom.low !== '' && !isNaN(Number(newCustom.low)) ? Number(newCustom.low) : null;
    const high = newCustom.high !== '' && !isNaN(Number(newCustom.high)) ? Number(newCustom.high) : null;

    const createdMarker = { key, label, unit, low, high };
    const updatedCustom = [...customMarkers, createdMarker];
    saveProfilePatch({ customLabMarkers: updatedCustom });

    if (newCustom.val !== '' && !isNaN(Number(newCustom.val))) {
      setEditing((prev) => ({
        ...prev,
        results: { ...(prev?.results || {}), [key]: Number(newCustom.val) },
      }));
    }

    setNewCustom({ label: '', unit: '', low: '', high: '', val: '' });
    setShowAddCustom(false);
    showToast(`Penanda "${label}" berhasil ditambahkan.`);
  };

  const handleDeleteCustomMarker = async (markerKey) => {
    const m = customMarkers.find((x) => x.key === markerKey);
    if (!m) return;
    if (
      !(await showConfirm(
        `Hapus penanda kustom "${m.label}"? Data yang sudah tersimpan di riwayat tidak akan dihapus.`,
        { title: 'Hapus Penanda', confirmText: 'Hapus', danger: true }
      ))
    )
      return;
    const updatedCustom = customMarkers.filter((x) => x.key !== markerKey);
    saveProfilePatch({ customLabMarkers: updatedCustom });
    showToast(`Penanda "${m.label}" dihapus.`);
  };

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
            const st = getMarkerStatus(m.key, value);
            const series = sorted.filter((e) => e.results?.[m.key] != null)
              .map((e) => ({ date: (e.testDate || '').slice(5), value: e.results[m.key] }));
            const isOpen = expandedMarker === m.key;
            return (
              <div key={m.key}>
                <button onClick={() => setExpandedMarker(isOpen ? null : m.key)} className="w-full flex items-baseline justify-between py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className={`body-md ${t.textMain}`}>{m.label}</span>
                    {m.isCustom && <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px] font-bold uppercase">Kustom</span>}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className={`body-md font-bold tabular-nums ${STATUS_COLOR[st] || t.textMain}`}>
                      {value ?? '—'} <span className={`caption font-medium ${t.textMuted}`}>{m.unit}</span>
                    </span>
                    <span className={`caption ${t.textMuted}`}>({getReferenceText(m)})</span>
                  </span>
                </button>
                {isOpen && (
                  <div className={`rounded-2xl ${t.bgSunken} p-3 mb-2`}>
                    <p className={`caption mb-2 ${STATUS_COLOR[st] || t.textMuted}`}>
                      {st ? `Nilai terakhir ${STATUS_LABEL[st]} umum (${getReferenceText(m)}).` : 'Belum ada nilai.'} Rentang rujukan labmu sendiri yang berlaku — tanyakan ke dokter.
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

      {editing && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm no-swipe" onClick={() => setEditing(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full sm:max-w-lg rounded-[2rem] border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} ${theme === 'dark' ? 'bg-[#0a1510]' : 'bg-white'} backdrop-blur-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl anim-rise`}
          >
            {/* Modal Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} shrink-0`}>
              <div className="flex items-center gap-2">
                <FlaskConical size={20} className="text-purple-500" />
                <h2 className={`h2 ${t.textMain}`}>Hasil Lab</h2>
              </div>
              <button onClick={() => setEditing(null)} className={`p-1.5 rounded-full ${t.btnBg} ${t.textMuted}`}>
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1 hide-scrollbar">
              {editing.fromOcr && (
                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">Hasil pindai foto — cocokkan dulu dengan lembar aslinya sebelum disimpan.</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`caption font-bold ${t.textMuted} block mb-1.5`}>Tanggal Periksa</label>
                  <input
                    type="date"
                    value={editing.testDate || ''}
                    onChange={(e) => setEditing({ ...editing, testDate: e.target.value })}
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} font-semibold text-sm outline-none`}
                  />
                </div>
                <div>
                  <label className={`caption font-bold ${t.textMuted} block mb-1.5`}>Nama Lab / Klinik</label>
                  <input
                    type="text"
                    placeholder="Contoh: Prodia, Pramita..."
                    value={editing.labName || ''}
                    onChange={(e) => setEditing({ ...editing, labName: e.target.value })}
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} font-semibold text-sm outline-none`}
                  />
                </div>
              </div>

              {LAB_PANELS.map((panel) => (
                <div key={panel.id} className={`rounded-2xl border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} ${t.bgSunken} p-3.5 space-y-2.5`}>
                  <p className={`caption font-black ${t.textMuted} uppercase tracking-wider`}>{panel.label}</p>
                  <div className="space-y-1.5">
                    {panel.markers.map((m) => (
                      <div
                        key={m.key}
                        className={`flex items-center justify-between gap-3 p-2 rounded-xl border ${theme === 'dark' ? 'border-white/5 bg-black/20' : 'border-black/5 bg-white'}`}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <p className={`text-sm font-bold ${t.textMain} truncate`}>{m.label}</p>
                          <p className={`text-[10px] ${t.textMuted}`}>Rujukan: {referenceText(m)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            placeholder="—"
                            value={editing.results[m.key] ?? ''}
                            onChange={(e) => setEditing({ ...editing, results: { ...editing.results, [m.key]: e.target.value } })}
                            className={`w-24 px-2.5 py-1.5 rounded-lg border ${t.border} ${t.inputBg} ${t.textMain} text-sm font-bold text-right tabular-nums outline-none focus:ring-1 focus:ring-purple-500`}
                          />
                          <span className={`text-xs font-semibold ${t.textMuted} w-14 truncate text-left pl-1`}>{m.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Panel Penanda Kustom */}
              <div className={`rounded-2xl border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} ${t.bgSunken} p-3.5 space-y-2.5`}>
                <div className="flex items-center justify-between">
                  <p className={`caption font-black ${t.textMuted} uppercase tracking-wider`}>Penanda Kustom / Tambahan</p>
                  <button
                    type="button"
                    onClick={() => setShowAddCustom(!showAddCustom)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold ${t.bgAccent} flex items-center gap-1 active:scale-95 transition-all`}
                  >
                    <Plus size={13} /> Tambah Kustom
                  </button>
                </div>

                {/* Form Tambah Penanda Kustom Baru */}
                {showAddCustom && (
                  <div className={`p-3.5 rounded-xl border border-purple-500/30 ${theme === 'dark' ? 'bg-purple-950/20' : 'bg-purple-50'} space-y-3 anim-rise`}>
                    <p className="text-xs font-bold text-purple-400">Buat Penanda Lab Kustom</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className={`text-[10px] font-bold ${t.textMuted} block mb-1`}>Nama Parameter *</label>
                        <input
                          type="text"
                          placeholder="Contoh: SGPT, Kreatinin, Hb..."
                          value={newCustom.label}
                          onChange={(e) => setNewCustom({ ...newCustom, label: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border ${t.border} ${t.inputBg} ${t.textMain} text-xs font-semibold outline-none`}
                        />
                      </div>
                      <div>
                        <label className={`text-[10px] font-bold ${t.textMuted} block mb-1`}>Satuan *</label>
                        <input
                          type="text"
                          placeholder="Contoh: U/L, mg/dL, g/dL..."
                          value={newCustom.unit}
                          onChange={(e) => setNewCustom({ ...newCustom, unit: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border ${t.border} ${t.inputBg} ${t.textMain} text-xs font-semibold outline-none`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={`text-[10px] font-bold ${t.textMuted} block mb-1`}>Min (Rujukan)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          placeholder="Batas Bawah"
                          value={newCustom.low}
                          onChange={(e) => setNewCustom({ ...newCustom, low: e.target.value })}
                          className={`w-full px-2.5 py-2 rounded-lg border ${t.border} ${t.inputBg} ${t.textMain} text-xs text-center font-bold outline-none`}
                        />
                      </div>
                      <div>
                        <label className={`text-[10px] font-bold ${t.textMuted} block mb-1`}>Max (Rujukan)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          placeholder="Batas Atas"
                          value={newCustom.high}
                          onChange={(e) => setNewCustom({ ...newCustom, high: e.target.value })}
                          className={`w-full px-2.5 py-2 rounded-lg border ${t.border} ${t.inputBg} ${t.textMain} text-xs text-center font-bold outline-none`}
                        />
                      </div>
                      <div>
                        <label className={`text-[10px] font-bold text-purple-400 block mb-1`}>Nilai Saat Ini</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          placeholder="Hasil Lab"
                          value={newCustom.val}
                          onChange={(e) => setNewCustom({ ...newCustom, val: e.target.value })}
                          className={`w-full px-2.5 py-2 rounded-lg border border-purple-500/40 ${t.inputBg} ${t.textMain} text-xs text-center font-bold outline-none`}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddCustom(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${t.btnBg} ${t.textMuted}`}
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCustomMarker}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${t.bgAccent}`}
                      >
                        Simpan Penanda
                      </button>
                    </div>
                  </div>
                )}

                {/* Daftar Penanda Kustom Yang Sudah Dibuat */}
                <div className="space-y-1.5">
                  {customMarkers.map((m) => (
                    <div
                      key={m.key}
                      className={`flex items-center justify-between gap-3 p-2 rounded-xl border ${theme === 'dark' ? 'border-white/5 bg-black/20' : 'border-black/5 bg-white'}`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm font-bold ${t.textMain} truncate`}>{m.label}</p>
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px] font-bold uppercase">Kustom</span>
                        </div>
                        <p className={`text-[10px] ${t.textMuted}`}>Rujukan: {getReferenceText(m)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          placeholder="—"
                          value={editing.results[m.key] ?? ''}
                          onChange={(e) => setEditing({ ...editing, results: { ...editing.results, [m.key]: e.target.value } })}
                          className={`w-24 px-2.5 py-1.5 rounded-lg border ${t.border} ${t.inputBg} ${t.textMain} text-sm font-bold text-right tabular-nums outline-none focus:ring-1 focus:ring-purple-500`}
                        />
                        <span className={`text-xs font-semibold ${t.textMuted} w-14 truncate text-left pl-1`}>{m.unit}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomMarker(m.key)}
                          className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Hapus Penanda"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {customMarkers.length === 0 && !showAddCustom && (
                    <p className={`caption ${t.textMuted} text-center py-2`}>Belum ada penanda kustom. Klik "+ Tambah Kustom" untuk menambah parameter baru.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`flex gap-3 px-5 py-4 border-t ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} shrink-0`}>
              <button
                onClick={() => setEditing(null)}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm ${t.btnBg} ${t.textMain}`}
              >
                Batal
              </button>
              <button
                onClick={save}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm ${t.bgAccent}`}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default LabResultsCard;
