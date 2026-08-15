/**
 * Makanan mana yang menyumbang sebuah nutrien di satu hari, terbanyak dulu.
 * Porsi dengan nama sama digabung supaya "Nasi Putih" tidak muncul empat kali.
 */
export const nutrientSources = (day, key) => {
  const totals = new Map();
  for (const items of Object.values(day?.meals || {})) {
    for (const item of items || []) {
      const amount = Number(item.nutrition?.[key]) || 0;
      if (amount > 0) totals.set(item.name, (totals.get(item.name) || 0) + amount);
    }
  }
  return [...totals].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
};
