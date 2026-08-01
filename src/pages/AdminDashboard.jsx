import React, { useState, useEffect } from 'react';

import { Check, X, Edit, AlertTriangle, ArrowLeft, DownloadCloud } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';

export default function AdminDashboard({ user, t, embedded }) {
  const [pendingFoods, setPendingFoods] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Check email


  const loadData = async () => {
    setLoading(true);
    try {
      const pSnap = await getDocs(collection(db, 'lomeal_pending_foods'));
      const pData = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPendingFoods(pData);

      const sSnap = await getDocs(collection(db, 'lomeal_correction_signals'));
      const sData = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSignals(sData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user?.email === 'untheryan@gmail.com') {
      loadData();
    }
  }, [user]);

  const handleApprove = async (food) => {
    try {
      const { id, ...data } = food;
      await setDoc(doc(db, 'lomeal_verified_foods', id), data);
      await deleteDoc(doc(db, 'lomeal_pending_foods', id));
      setPendingFoods(prev => prev.filter(f => f.id !== id));
    } catch (e) {
      console.error(e);
      alert('Error approving');
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm('Reject this food?')) return;
    try {
      await deleteDoc(doc(db, 'lomeal_pending_foods', id));
      setPendingFoods(prev => prev.filter(f => f.id !== id));
    } catch (e) {
      console.error(e);
      alert('Error rejecting');
    }
  };

  const handleEdit = (food) => {
    const newName = window.prompt('Edit name', food.name);
    if (!newName) return;
    const newKcal = window.prompt('Edit calories', food.nutrition?.kcal || 0);
    if (newKcal === null) return;

    const updatedFood = {
      ...food,
      name: newName,
      nutrition: { ...food.nutrition, kcal: Number(newKcal) }
    };
    
    setDoc(doc(db, 'lomeal_pending_foods', food.id), updatedFood)
      .then(() => {
        setPendingFoods(prev => prev.map(f => f.id === food.id ? updatedFood : f));
      })
      .catch(console.error);
  };

  const handleDeleteSignal = async (id) => {
    try {
      await deleteDoc(doc(db, 'lomeal_correction_signals', id));
      setSignals(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  if (user?.email !== 'untheryan@gmail.com') return null;

  return (
    <div className={embedded ? 'space-y-4' : `min-h-screen ${t.bgApp} ${t.textMain} pb-24`}>
      {!embedded && (
        <div className={`${t.bgCard} p-4 flex items-center sticky top-0 z-10 border-b ${t.border}`}>
          <button onClick={() => window.history.back()} className={`p-2 rounded-full ${t.btnBg} mr-3`}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold">Admin Panel</h1>
        </div>
      )}

      <div className={embedded ? '' : 'p-4' + ' space-y-8'}>
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <DownloadCloud className="text-blue-500" /> OTA Update Control
          </h2>
          <div className={`${t.bgCardSoft} border ${t.border} p-4 rounded-2xl space-y-4`}>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-70">Version</label>
              <input 
                type="text" 
                id="otaVersion"
                placeholder="e.g. 0.1.7" 
                className={`w-full p-2 rounded-xl bg-transparent border ${t.border}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-70">URL</label>
              <input 
                type="text" 
                id="otaUrl"
                placeholder="https://lomeal.web.app/ota/update_017.zip" 
                className={`w-full p-2 rounded-xl bg-transparent border ${t.border}`}
              />
            </div>
            <button 
              onClick={async () => {
                const v = document.getElementById('otaVersion').value;
                const u = document.getElementById('otaUrl').value;
                if(!v || !u) return alert('Isi version dan URL!');
                try {
                  await setDoc(doc(db, 'lomeal_settings', 'ota_update'), {
                    ota_version: v,
                    ota_url: u,
                    is_forced: false,
                    release_notes: 'Update via Admin Panel'
                  }, { merge: true });
                  alert('OTA Updated in Firestore!');
                } catch(e) {
                  alert(e.message);
                }
              }}
              className="w-full py-2 bg-blue-500 text-white rounded-xl font-bold active:scale-95"
            >
              Deploy OTA Settings
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Check className="text-green-500" /> Pending Review ({pendingFoods.length})
          </h2>
          {loading && <p className={t.textMuted}>Loading...</p>}
          {!loading && pendingFoods.length === 0 && <p className={t.textMuted}>No pending foods.</p>}
          
          <div className="space-y-4">
            {pendingFoods.map(food => (
              <div key={food.id} className={`${t.bgCardSoft} border ${t.border} p-4 rounded-2xl`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">{food.name}</h3>
                    <p className={`text-sm ${t.textMuted}`}>{food.grams} {food.unit || 'g'} • {food.source}</p>
                    <p className={`text-sm font-medium ${t.textAccent} mt-1`}>
                      {food.nutrition?.kcal} kcal (P:{food.nutrition?.protein} C:{food.nutrition?.carbs} F:{food.nutrition?.fat})
                    </p>
                    {food.searchCount > 0 && (
                      <p className={`text-xs ${t.textMuted} mt-1`}>Searched {food.searchCount} times</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => handleApprove(food)} className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500/20 text-green-500 rounded-xl font-medium hover:bg-green-500/30">
                    <Check size={18} /> Approve
                  </button>
                  <button onClick={() => handleEdit(food)} className={`flex-1 flex items-center justify-center gap-2 py-2 ${t.btnBg} rounded-xl font-medium`}>
                    <Edit size={18} /> Edit
                  </button>
                  <button onClick={() => handleReject(food.id)} className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-500/20 text-red-400 rounded-xl font-medium hover:bg-red-500/30">
                    <X size={18} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="text-amber-500" /> Correction Signals ({signals.length})
          </h2>
          {!loading && signals.length === 0 && <p className={t.textMuted}>No signals.</p>}
          
          <div className="space-y-4">
            {signals.map(signal => (
              <div key={signal.id} className={`${t.bgCardSoft} border ${t.border} p-4 rounded-2xl flex justify-between items-center`}>
                <div>
                  <h3 className="font-bold">{signal.foodName}</h3>
                  <p className={`text-sm ${t.textMuted}`}>
                    Reported {signal.count} times
                  </p>
                  <p className="text-sm mt-1">
                    <span className="line-through text-red-400 opacity-70">{signal.oldKcal} kcal</span> 
                    <span className="mx-2 text-slate-400">→</span> 
                    <span className="text-green-500 font-bold">{signal.newKcal} kcal</span>
                  </p>
                </div>
                <button onClick={() => handleDeleteSignal(signal.id)} className={`p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30`}>
                  <X size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
