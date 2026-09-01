import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { getLocalYMD } from '../data/constants';
import { formatNumber } from '../utils/numberFormat';
import { computeDayTotals, calcTEF } from '../data/nutrition';
import { extractLyfitDay } from '../utils/lyfitSync';

const NutritionChart = ({ t, theme, daysMap = {}, lyfitYearData, targets = {}, soundEnabled, playSoundEffect, onPointClick, language }) => {
  const chartMetricsList = [
      { key: 'calories', label: 'Kalori', color: theme === 'dark' ? '#7c85d4' : '#4f46e5', type: 'grouped',
        subMetrics: [
            { key: 'nutritionCalories', label: 'Dimakan', color: theme === 'dark' ? '#3daa5c' : '#059669' },
            { key: 'activityCalories', label: 'Dibakar', color: theme === 'dark' ? '#5090d4' : '#2563eb' }
        ]
      },
      { key: 'delta', label: 'Delta', color: theme === 'dark' ? '#3daa5c' : '#059669', type: 'single' },
      { key: 'protein', label: 'Protein', color: theme === 'dark' ? '#c98920' : '#f59e0b', type: 'single' },
      { key: 'fat', label: 'Lemak', color: theme === 'dark' ? '#cd4a4a' : '#dc2626', type: 'single' },
      { key: 'carbs', label: 'Karbo', color: theme === 'dark' ? '#3a8fbf' : '#0ea5e9', type: 'single' }
  ];

  const [activeMetric, setActiveMetric] = useState('calories');

  const toggleChartMetric = (key) => {
      if (playSoundEffect && soundEnabled) playSoundEffect('click', soundEnabled);
      setActiveMetric(key);
  };

  const multiChartData = useMemo(() => {
      const data = [];
      const bioEntries = [];
      const todayStr = getLocalYMD(new Date());
      Object.keys(daysMap).forEach(dateStr => {
          if (dateStr <= todayStr) {
              bioEntries.push({ dateStr, dayData: daysMap[dateStr] });
          }
      });
      bioEntries.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

      bioEntries.forEach(entry => {
          const d = new Date(entry.dateStr);
          const totals = computeDayTotals(entry.dayData);
          const lyfitDay = extractLyfitDay(lyfitYearData, entry.dateStr);
          const eaten = totals.kcal || 0;
          
          let dayTargets = (entry.dateStr >= todayStr ? targets : entry.dayData?.targetSnapshot) || targets;
          const baseTdee = dayTargets?.tdee || dayTargets?.kcal || 0;
          const bmrBase = lyfitDay?.bmr || dayTargets?.bmr || 1600;

          // Hitung TEF hari itu
          const tefDay = calcTEF({
            protein: totals.protein,
            carbs: totals.carbs,
            fat: totals.fat,
            kcal: eaten,
            bmr: bmrBase,
          }).total;

          // Total kalori dibakar riil hari itu
          const burnedActual = lyfitDay?.burnedKcal || (bmrBase + tefDay);
          const tdeeEffective = lyfitDay?.burnedKcal ? burnedActual : (baseTdee || burnedActual);
          
          const targetDeltaVal = (dayTargets?.kcal || baseTdee) - baseTdee; // 0=maint, neg=cut, pos=bulk
          const allowanceDay = lyfitDay?.burnedKcal 
            ? Math.max(0, lyfitDay.burnedKcal + targetDeltaVal) 
            : (dayTargets?.kcal || baseTdee);

          let delta = null;
          if (eaten > 0 && tdeeEffective > 0) {
             // Net metabolisme nyata: Kalori Dimakan - Kalori Dibakar Aktual
             delta = Math.round(eaten - tdeeEffective);
          }

          data.push({
              name: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              dateFull: entry.dateStr,
              nutritionCalories: eaten > 0 ? eaten : null,
              activityCalories: burnedActual > 0 ? burnedActual : null,
              delta: delta,
              protein: totals.protein > 0 ? totals.protein : null,
              fat: totals.fat > 0 ? totals.fat : null,
              carbs: totals.carbs > 0 ? totals.carbs : null,
              targetCalories: allowanceDay || null,
              targetProtein: dayTargets?.protein || null,
              targetFat: dayTargets?.fat || null,
              targetCarbs: dayTargets?.carbs || null,
              targetDelta: targetDeltaVal,
          });
      });
      return data;
  }, [daysMap, lyfitYearData, targets]);

  const scrollRef = useRef(null);

  // Pinch-to-zoom logic
  const [pointWidth, setPointWidth] = useState(45);
  const touchState = useRef({ initialDist: 0, initialPointWidth: 45, pinchRatio: 0, scrollRelCenterX: 0 });
  const scrollTarget = useRef(null);

  const scrollToRight = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, []);

  // Auto scroll mentok ke kanan (menampilkan hari ini / data terbaru)
  useEffect(() => {
    if (multiChartData.length > 0) {
      scrollToRight();
      const t1 = setTimeout(scrollToRight, 50);
      const t2 = setTimeout(scrollToRight, 150);
      const raf = requestAnimationFrame(scrollToRight);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        cancelAnimationFrame(raf);
      };
    }
  }, [multiChartData, activeMetric, scrollToRight]);

  const [yDomain, setYDomain] = useState(['auto', 'auto']);
  const pointWidthRef = useRef(pointWidth);
  useEffect(() => { pointWidthRef.current = pointWidth; }, [pointWidth]);
  const rafRef = useRef(null);

  const updateYDomain = useCallback(() => {
      if (!scrollRef.current || multiChartData.length === 0) return;
      const { scrollLeft, clientWidth } = scrollRef.current;
      const pw = pointWidthRef.current;
      
      const startIndex = Math.max(0, Math.floor(scrollLeft / pw));
      const endIndex = Math.min(multiChartData.length - 1, Math.ceil((scrollLeft + clientWidth) / pw));
      const visibleData = multiChartData.slice(startIndex, endIndex + 1);
      
      let min = Infinity;
      let max = -Infinity;
      const activeObj = chartMetricsList.find(m => m.key === activeMetric);

      const findMinMax = (dataList) => {
          dataList.forEach(d => {
              if (activeObj.type === 'single') {
                  let val = d[activeMetric];
                  if (val !== null && val !== undefined) {
                      if (val < min) min = val;
                      if (val > max) max = val;
                  }
              } else {
                  activeObj.subMetrics.forEach(sub => {
                      let val = d[sub.key];
                      if (val !== null && val !== undefined) {
                          if (val < min) min = val;
                          if (val > max) max = val;
                      }
                  });
              }
          });
      };

      findMinMax(visibleData);
      if (min === Infinity || max === -Infinity) findMinMax(multiChartData);

      if (min !== Infinity && max !== -Infinity) {
          let maxTargetInView = 0;
          visibleData.forEach(d => {
             if (activeMetric === 'calories' && d.targetCalories > maxTargetInView) maxTargetInView = d.targetCalories;
             if (activeMetric === 'protein' && d.targetProtein > maxTargetInView) maxTargetInView = d.targetProtein;
             if (activeMetric === 'fat' && d.targetFat > maxTargetInView) maxTargetInView = d.targetFat;
             if (activeMetric === 'carbs' && d.targetCarbs > maxTargetInView) maxTargetInView = d.targetCarbs;
             const tVal = d[`target${activeMetric.charAt(0).toUpperCase() + activeMetric.slice(1)}`];
             if (tVal > maxTargetInView) maxTargetInView = tVal;
          });

          if (activeMetric === 'delta') {
              let maxAbsTargetDelta = 0;
              visibleData.forEach(d => {
                 if (d.targetDelta != null && Math.abs(d.targetDelta) > maxAbsTargetDelta) maxAbsTargetDelta = Math.abs(d.targetDelta);
              });
              const visibleDeltas = visibleData.map(d => d.delta).filter(v => v !== null && v !== undefined);
              const maxVisible = visibleDeltas.length > 0 ? Math.max(...visibleDeltas.map(Math.abs)) : 0;
              const absMax = Math.max(maxVisible, maxAbsTargetDelta, 100);
              const upper = Math.ceil((absMax * 1.35) / 50) * 50;
              setYDomain([-upper, upper]);
          } else {
              const effectiveMax = Math.max(max, maxTargetInView);
              const effectiveDiff = effectiveMax - (min < 0 ? 0 : min);
              const upper = effectiveMax + effectiveDiff * 0.15 || effectiveMax * 1.1;
              setYDomain([0, upper === 0 ? 100 : upper]);
          }
      }
  }, [multiChartData, activeMetric, pointWidth]);

  const handleScroll = () => {
      if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
              updateYDomain();
              rafRef.current = null;
          });
      }
  };

  useEffect(() => {
      updateYDomain();
  }, [updateYDomain]);

  const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          pinchStartDistRef.current = dist;
          initialPointWidthRef.current = pointWidth;
      }
  };

  const handleTouchMove = (e) => {
      if (e.touches.length === 2 && pinchStartDistRef.current) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          const scale = dist / pinchStartDistRef.current;
          const newWidth = Math.min(100, Math.max(20, initialPointWidthRef.current * scale));
          setPointWidth(newWidth);
      }
  };

  const chartWidth = Math.max(multiChartData.length * pointWidth, 300);

  useEffect(() => {
      if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
      }
  }, [multiChartData.length]);

  const activeObj = chartMetricsList.find(m => m.key === activeMetric);

  return (
    <div className="p-5">
         <div ref={scrollRef} 
              onScroll={handleScroll}
              onTouchStartCapture={handleTouchStart} 
              onTouchMoveCapture={handleTouchMove}
              className="w-full overflow-x-auto scrollbar-hide mb-4 touch-pan-x pt-2" 
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
             <div style={{ width: `${chartWidth}px`, height: '280px' }} className="cursor-crosshair relative">
                 <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ padding: '10px 0 30px 0' }}>
                     {[0, 25, 50, 75, 100].map((pct, i) => (
                         <line key={i} x1="0" y1={`${pct}%`} x2="100%" y2={`${pct}%`} stroke={theme === 'dark' ? '#3f3f46' : '#cbd5e1'} strokeDasharray="3 3" strokeWidth="1" />
                     ))}
                 </svg>

                 <ComposedChart 
                    width={chartWidth}
                    height={280}
                    data={multiChartData} 
                    style={{ outline: 'none' }}
                    onClick={(e) => {
                        if(e && e.activePayload && e.activePayload.length > 0) {
                            onPointClick(e.activePayload[0].payload.dateFull);
                        }
                    }}
                 >
                    <defs>
                        {chartMetricsList.map(metric => (
                            metric.type === 'single' ? (
                                <linearGradient key={metric.key} id={`gradient-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={metric.color} stopOpacity={1}/>
                                    <stop offset="95%" stopColor={metric.color} stopOpacity={0.3}/>
                                </linearGradient>
                            ) : (
                                metric.subMetrics.map(sub => (
                                    <linearGradient key={sub.key} id={`gradient-${sub.key}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={sub.color} stopOpacity={1}/>
                                        <stop offset="95%" stopColor={sub.color} stopOpacity={0.3}/>
                                    </linearGradient>
                                ))
                            )
                        ))}
                    </defs>
                    <Tooltip 
                       formatter={(value, name, props) => {
                           if (props.dataKey === 'delta') {
                             return [`${value > 0 ? '+' : ''}${formatNumber(value, language)} kkal`, 'Delta'];
                           }
                           if (props.dataKey === 'targetDelta') {
                             return [`${value > 0 ? '+' : ''}${formatNumber(value, language)} kkal`, 'Target Delta'];
                           }
                           if (props.dataKey === 'nutritionCalories') {
                             return [`${formatNumber(value, language)} kkal`, 'Dimakan'];
                           }
                           if (props.dataKey === 'activityCalories') {
                             return [`${formatNumber(value, language)} kkal`, 'Dibakar'];
                           }
                           if (props.dataKey === 'targetCalories') {
                             return [`${formatNumber(value, language)} kkal`, 'Target Kalori'];
                           }
                           let unit = (activeMetric === 'calories' || activeMetric === 'delta') ? ' kkal' : ' g';
                           return [`${formatNumber(value, language)}${unit}`, name];
                       }}
                       cursor={{ fill: theme === 'dark' ? '#27272a' : '#f4f4f5' }} 
                       contentStyle={{ backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', borderRadius: '16px', border: '1px solid ' + t.border, padding: '10px 14px', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.2)' }} 
                       itemStyle={{ padding: 0, margin: 0, marginTop: '4px' }} 
                       labelStyle={{ color: theme === 'dark' ? '#a1a1aa' : '#71717a', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }} 
                    />
                    <XAxis dataKey="name" stroke={theme === 'dark' ? '#a1a1aa' : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis domain={yDomain} hide={true} />
                    
                    {activeMetric === 'calories' && (
                        <Line type="bumpX" dataKey="targetCalories" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {activeMetric === 'protein' && (
                        <Line type="bumpX" dataKey="targetProtein" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {activeMetric === 'fat' && (
                        <Line type="bumpX" dataKey="targetFat" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {activeMetric === 'carbs' && (
                        <Line type="bumpX" dataKey="targetCarbs" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {activeMetric === 'delta' && (
                        <>
                            <ReferenceLine y={0} stroke={theme === 'dark' ? '#52525b' : '#d4d4d8'} strokeWidth={1} strokeDasharray="3 3" />
                            <Line type="bumpX" dataKey="targetDelta" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </>
                    )}

                    {activeMetric === 'delta' ? (
                        <Bar 
                            dataKey="delta" 
                            name="Delta" 
                            radius={[50, 50, 50, 50]}
                            isAnimationActive={false} 
                            maxBarSize={28}
                        >
                            {multiChartData.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.delta >= 0 
                                      ? (theme === 'dark' ? '#3daa5c' : '#059669') 
                                      : (theme === 'dark' ? '#cd4a4a' : '#dc2626')} 
                                />
                            ))}
                        </Bar>
                    ) : activeObj.type === 'single' ? (
                        <Bar 
                            dataKey={activeMetric} 
                            name={activeObj.label} 
                            fill={`url(#gradient-${activeMetric})`}
                            radius={[50, 50, 0, 0]} 
                            isAnimationActive={false} 
                            maxBarSize={30}
                        />
                    ) : (
                        activeObj.subMetrics.map(sub => (
                            <Bar 
                                key={sub.key}
                                dataKey={sub.key} 
                                name={sub.label} 
                                fill={`url(#gradient-${sub.key})`}
                                radius={[50, 50, 0, 0]} 
                                isAnimationActive={false}
                                maxBarSize={15}
                            />
                        ))
                    )}
                 </ComposedChart>
             </div>
         </div>
         
         <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar snap-x" style={{ WebkitOverflowScrolling: 'touch' }}>
            {chartMetricsList.map(metric => {
                const isActive = activeMetric === metric.key;
                return (
                    <button key={metric.key} onClick={() => toggleChartMetric(metric.key)} className="px-3 py-1.5 rounded-full caption font-black transition-all border active:scale-95 whitespace-nowrap snap-start flex items-center justify-center h-8" style={{ backgroundColor: isActive ? metric.color : 'transparent', borderColor: metric.color, color: isActive ? '#fff' : metric.color, opacity: isActive ? 1 : 0.5 }}>
                        {metric.label}
                    </button>
                )
            })}
         </div>
    </div>
  );
};

export default NutritionChart;
