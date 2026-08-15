// Penanda laboratorium yang dilacak di dasbor. Rentang rujukan = nilai dewasa umum di
// laboratorium Indonesia; TIAP LAB PUNYA RENTANGNYA SENDIRI dan itu yang berlaku, jadi
// angka di sini cuma buat mewarnai grafik — bukan penentu normal/tidak.
//
// `low`/`high` null = tidak ada batas di sisi itu (mis. LDL cuma punya batas atas).
export const LAB_PANELS = [
  {
    id: 'glukosa', label: 'Gula Darah', markers: [
      { key: 'gdp', label: 'GD Puasa', unit: 'mg/dL', low: 70, high: 99 },
      { key: 'gd2pp', label: 'GD 2 Jam PP', unit: 'mg/dL', low: null, high: 140 },
      { key: 'gds', label: 'GD Sewaktu', unit: 'mg/dL', low: null, high: 200 },
      { key: 'hba1c', label: 'HbA1c', unit: '%', low: null, high: 5.7 },
    ],
  },
  {
    id: 'lipid', label: 'Profil Lipid', markers: [
      { key: 'kolesterolTotal', label: 'Kolesterol Total', unit: 'mg/dL', low: null, high: 200 },
      { key: 'trigliserida', label: 'Trigliserida', unit: 'mg/dL', low: null, high: 150 },
      { key: 'ldl', label: 'LDL', unit: 'mg/dL', low: null, high: 100 },
      { key: 'hdl', label: 'HDL', unit: 'mg/dL', low: 40, high: null },
    ],
  },
  {
    id: 'ginjal', label: 'Asam Urat & Ginjal', markers: [
      { key: 'asamUrat', label: 'Asam Urat', unit: 'mg/dL', low: 3.4, high: 7.0 },
    ],
  },
  {
    id: 'tiroid', label: 'Hormon Tiroid', markers: [
      { key: 'tsh', label: 'TSH', unit: 'mIU/L', low: 0.4, high: 4.0 },
      { key: 'ft4', label: 'FT4', unit: 'ng/dL', low: 0.8, high: 1.8 },
    ],
  },
  {
    id: 'mineral', label: 'Vitamin & Elektrolit', markers: [
      { key: 'vitD25oh', label: 'Vitamin D (25-OH)', unit: 'ng/mL', low: 30, high: 100 },
      { key: 'kalsium', label: 'Kalsium', unit: 'mg/dL', low: 8.5, high: 10.5 },
      { key: 'natrium', label: 'Natrium', unit: 'mmol/L', low: 135, high: 145 },
      { key: 'kalium', label: 'Kalium', unit: 'mmol/L', low: 3.5, high: 5.1 },
      { key: 'klorida', label: 'Klorida', unit: 'mmol/L', low: 98, high: 107 },
    ],
  },
  {
    id: 'hormon', label: 'Hormon Lain', markers: [
      { key: 'testosteron', label: 'Testosteron Total', unit: 'ng/dL', low: 300, high: 1000 },
    ],
  },
];

export const LAB_MARKERS = LAB_PANELS.flatMap((p) => p.markers);
export const findMarker = (key) => LAB_MARKERS.find((m) => m.key === key) || null;

/** 'low' | 'high' | 'normal' | null — null kalau tidak ada nilai atau tidak ada rujukan. */
export const markerStatus = (key, value) => {
  const m = findMarker(key);
  if (!m || value == null || value === '') return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (m.low != null && v < m.low) return 'low';
  if (m.high != null && v > m.high) return 'high';
  return 'normal';
};

export const referenceText = (m) => {
  if (m.low != null && m.high != null) return `${m.low}–${m.high} ${m.unit}`;
  if (m.high != null) return `< ${m.high} ${m.unit}`;
  if (m.low != null) return `> ${m.low} ${m.unit}`;
  return m.unit;
};

export const LAB_DISCLAIMER = `Fitur ini cuma mencatat dan menampilkan tren angka labmu — bukan alat diagnosis. Hasil lab harus dibaca dokter bersama gejala dan riwayatmu, dan tiap laboratorium punya rentang rujukannya sendiri. Angka hasil pindai foto bisa salah baca, jadi selalu cocokkan dengan lembar aslinya. Lomeal tidak memberi diagnosis, nama penyakit, maupun dosis obat.`;
