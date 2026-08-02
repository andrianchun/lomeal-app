import { ShieldAlert, ShieldCheck, Lock, FlaskConical, Check } from 'lucide-react';

// Step 'consent' onboarding — SENGAJA halaman penuh yang scroll natural, bukan kartu
// carousel bertinggi tetap kayak step lain. Dulu 3 poin persetujuan dipaksa masuk kartu
// h-[480px] dengan scrollbar disembunyikan (hide-scrollbar) — di layar kecil, poin
// terakhir bisa ketutup tanpa ada tanda apa pun kalau masih ada konten di bawah, dan
// tombol Lanjut TIDAK dirender sama sekali sampai semua wajib dicentang (bukan cuma
// disabled) — user yang belum sadar harus scroll+centang cuma lihat layar buntu tanpa
// petunjuk. Sekarang: scroll biasa, tombol Lanjut selalu kelihatan (disabled + teks
// bantu), dan 1 poin baru (riset anonim) yang OPSIONAL — tidak menggerbang tombol.
export default function ConsentScreen({ t, isDark, consents, setConsents, onNext }) {
  const requiredOk = consents.medical && consents.allergy && consents.privacy;
  const toggle = (id) => setConsents((c) => ({ ...c, [id]: !c[id] }));

  const Item = ({ id, icon: Icon, title, body, optional }) => (
    <button
      onClick={() => toggle(id)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${consents[id] ? `${t.borderAccent} ${t.bgAccentSoft}` : `${isDark ? 'border-transparent bg-white/5' : 'border-white/50 bg-white/60'}`}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 p-2 rounded-xl ${consents[id] ? t.bgAccent : t.bgSunken}`}>
          <Icon size={16} className={consents[id] ? 'text-white' : t.textMuted} />
        </span>
        <div className="flex-1">
          <p className={`body-md ${t.textMain} flex items-center gap-2 flex-wrap`}>
            {title}
            {optional && <span className={`caption font-bold px-1.5 py-0.5 rounded-md ${t.bgSunken} ${t.textMuted}`}>Opsional</span>}
          </p>
          <p className={`caption mt-1 font-medium leading-relaxed ${t.textMuted}`}>{body}</p>
        </div>
        <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${consents[id] ? `${t.bgAccent} border-transparent` : t.border}`}>
          {consents[id] && <Check size={13} className="text-white" strokeWidth={3} />}
        </span>
      </div>
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-4 flex flex-col">
      <div className="max-w-lg w-full mx-auto flex flex-col gap-5 flex-1">
        <div className="text-center">
          <h2 className={`text-xl sm:text-2xl font-black leading-tight ${t.textMain}`}>Persetujuan Pengguna</h2>
          <p className={`caption font-medium mt-2 ${t.textMuted}`}>Baca dan centang 3 poin wajib di bawah untuk melanjutkan.</p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Item id="medical" icon={ShieldAlert} title="Medical Disclaimer"
            body="Lomeal adalah alat pencatat nutrisi mandiri, BUKAN alat diagnosis, rujukan, atau pengganti nasihat medis klinis." />
          <Item id="allergy" icon={ShieldCheck} title="Allergy Liability"
            body="Estimasi kandungan makanan bisa meleset. Saya membebaskan pengembang dari tuntutan hukum terkait komplikasi metabolik, reaksi alergi, maupun kontaminasi bahan makanan." />
          <Item id="privacy" icon={Lock} title="Privasi Data Sensitif"
            body="Data biometrik & log makanan saya tersimpan aman di server (dilindungi standar enkripsi Google Cloud saat tersimpan), digunakan hanya untuk fungsi aplikasi ini, dan tidak dibagikan ke pihak ketiga untuk kepentingan komersial." />
        </div>

        <div className={`border-t pt-4 ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <Item id="research" icon={FlaskConical} title="Riset Anonim" optional
            body="Data saya yang SUDAH DIANONIMKAN (tanpa nama, tanpa identitas) boleh dipakai pengembang untuk riset internal demi meningkatkan kualitas aplikasi." />
        </div>
      </div>

      <div className="max-w-lg w-full mx-auto shrink-0 pt-4">
        <button
          onClick={onNext}
          disabled={!requiredOk}
          className={`w-full py-4 rounded-2xl font-black text-sm transition-all ${requiredOk ? `${t.bgAccent} text-white shadow-lg active:scale-95` : `${t.bgSunken} ${t.textMuted}`}`}
        >
          Lanjut
        </button>
        {!requiredOk && (
          <p className={`caption text-center mt-2 font-medium ${t.textMuted}`}>Centang 3 poin wajib di atas untuk melanjutkan.</p>
        )}
      </div>
    </div>
  );
}
