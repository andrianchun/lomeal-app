import { ChevronRight } from 'lucide-react';

// Kartu pilihan buat wizard kuesioner — dulu disalin byte-per-byte di OnboardingFlow.jsx
// dan DietQuestionnaireModal.jsx.
const OptionCard = ({ t, isDark, selected, onClick, children }) => (
  <button
    onClick={onClick}
    className={`w-full text-left p-3.5 rounded-2xl border-2 backdrop-blur-md transition-all duration-200 active:scale-[0.98] flex items-center justify-between ${
      selected ? `${t.borderAccent} ${t.bgAccent} text-white shadow-lg` : `${isDark ? 'border-transparent bg-white/5' : 'border-white/50 bg-white/60'}`
    }`}
  >
    {children}
    <ChevronRight size={16} className={selected ? 'text-white' : t.textMuted} />
  </button>
);

export default OptionCard;
