import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { getLocalYMD } from '../data/constants';
import { formatNumber } from '../utils/numberFormat';
import { computeDayTotals } from '../data/nutrition';

const NutritionChart = ({ t, theme, daysMap = {}, lyfitYearData, targets = {}, soundEnabled, playSoundEffect, onPointClick, language }) => {
  const chartMetricsList = [
      { key: 'calories', label: 'Kalori', color: theme === 'dark' ? '#818cf8' : '#4f46e5', type: 'grouped',
        subMetrics: [
            { key: 'nutritionCalories', label: 'Dimakan', color: theme === 'dark' ? '#34d399' : '#059669' },
            { key: 'activityCalories', label: 'Dibakar', color: theme === 'dark' ? '#60a5fa' : '#2563eb' }
        ]
      },
      { key: 'delta', label: 'Delta', color: theme === 'dark' ? '#f43f5e' : '#e11d48', type: 'single' },
      { key: 'protein', label: 'Protein', color: theme === 'dark' ? '#fbbf24' : '#f59e0b', type: 'single' },
      { key: 'fat', label: 'Lemak', color: theme === 'dark' ? '#f87171' : '#ef4444', type: 'single' },
      { key: 'carbs', label: 'Karbo', color: theme === 'dark' ? '#38bdf8' : '#0ea5e9', type: 'single' }
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
          const burned = Number(lyfitYearData?.[entry.dateStr]?.bioData?.activityCalories) || 0;
          const eaten = totals.kcal || 0;
          
          let dayTargets = entry.dayData?.targetSnapshot || targets;
          
          let delta = null;
          let targetDeltaVal = 0;
          if (eaten > 0 && dayTargets?.kcal) {
             delta = Math.round(eaten - (dayTargets.tdee || dayTargets.kcal) - burned);
          }
          if (dayTargets?.kcal) {
             targetDeltaVal = dayTargets.kcal - (dayTargets.tdee || dayTargets.kcal);
          }

          data.push({
              name: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              dateFull: entry.dateStr,
              nutritionCalories: eaten > 0 ? eaten : null,
              activityCalories: burned > 0 ? burned : null,
              delta: delta,
              protein: totals.protein > 0 ? totals.protein : null,
              fat: totals.fat > 0 ? totals.fat : null,
              carbs: totals.carbs > 0 ? totals.carbs : null,
              targetCalories: dayTargets?.tdee || dayTargets?.kcal || null,
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

  // Auto scroll ke tengah titik data terbaru
  useEffect(() => {
     if(scrollRef.current && multiChartData.length > 0) {
        const data = multiChartData;
        const activeObj = chartMetricsList.find(m => m.key === activeMetric);
        
        let latestIdxWithData = -1;
        for (let i = data.length - 1; i >= 0; i--) {
            const hasData = activeObj.type === 'single' 
                ? (data[i][activeMetric] !== undefined && data[i][activeMetric] !== null)
                : (data[i].nutritionCalories !== null || data[i].activityCalories !== null);

            if (hasData) {
                latestIdxWithData = i;
                break;
            }
        }
        
        if (latestIdxWithData !== -1) {
             const latestDateObj = new Date(data[latestIdxWithData].dateFull);
             const oneMonthAgo = new Date(latestDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);
             const oneMonthAgoStr = getLocalYMD(oneMonthAgo);

             let startIdx = latestIdxWithData;
             while (startIdx > 0 && data[startIdx - 1].dateFull >= oneMonthAgoStr) {
                 startIdx--;
             }

             const numPoints = latestIdxWithData - startIdx + 1;
             const clientW = scrollRef.current.clientWidth || (window.innerWidth - 64);
             
             let newPointWidth = clientW / Math.max(1.5, numPoints);
             if (newPointWidth > 200) newPointWidth = 200;
             if (newPointWidth < 25) newPointWidth = 25;

             setPointWidth(newPointWidth);
             scrollTarget.current = startIdx * newPointWidth;
        } else {
             const clientW = scrollRef.current.clientWidth || (window.innerWidth - 64);
             scrollTarget.current = Math.max(0, ((data.length - 1) * pointWidth) - (clientW / 2));
        }
     }
  }, [multiChartData, activeMetric]);
  const scrollTarget = useRef(null);

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
          });

          const diff = max - min;
          if (activeMetric === 'delta') {
              let maxAbsTargetDelta = 0;
              visibleData.forEach(d => {
                 if (Math.abs(d.targetDelta) > maxAbsTargetDelta) maxAbsTargetDelta = Math.abs(d.targetDelta);
              });
              const absMax = Math.max(Math.abs(min), Math.abs(max), maxAbsTargetDelta);
              setYDomain([-(absMax * 1.15), absMax * 1.15]);
          } else {
              const effectiveMax = Math.max(max, maxTargetInView);
              const effectiveDiff = effectiveMax - min;
              const upper = effectiveMax + effectiveDiff * 0.15 || effectiveMax * 1.1;
              setYDomain([0, upper === 0 ? 100 : upper]);
          }
      } else {
          setYDomain(activeMetric === 'delta' ? [-100, 100] : [0, 100]);
      }
  }, [multiChartData, activeMetric]);

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
  }, [updateYDomain, pointWidth]);

  const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          
          const pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const rect = scrollRef.current.getBoundingClientRect();
          const scrollRelCenterX = pinchCenterX - rect.left;
          
          const currentScrollLeft = scrollRef.current.scrollLeft;
          const currentChartWidth = Math.max(multiChartData.length * pointWidth, window.innerWidth - 64);
          
          const pinchRatio = (scrollRelCenterX + currentScrollLeft) / currentChartWidth;
          
          touchState.current = { initialDist: dist, initialPointWidth: pointWidth, pinchRatio, scrollRelCenterX };
      }
  };

  const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          const scale = dist / touchState.current.initialDist;
          let newWidth = touchState.current.initialPointWidth * scale;
          if (newWidth < 25) newWidth = 25;
          if (newWidth > 200) newWidth = 200;
          setPointWidth(newWidth);
          
          const nextChartWidth = Math.max(multiChartData.length * newWidth, window.innerWidth - 64);
          const newPinchAbsX = touchState.current.pinchRatio * nextChartWidth;
          scrollTarget.current = newPinchAbsX - touchState.current.scrollRelCenterX;
      }
  };

  useEffect(() => {
     if (scrollTarget.current !== null && scrollRef.current) {
         scrollRef.current.scrollLeft = scrollTarget.current;
         scrollTarget.current = null;
     }
  }, [pointWidth]);

  const chartWidth = Math.max(multiChartData.length * pointWidth, window.innerWidth - 64);
  const activeObj = chartMetricsList.find(m => m.key === activeMetric);

  return (
    <div className="p-5">
         <div ref={scrollRef} 
              onScroll={handleScroll}
              onTouchStartCapture={handleTouchStart} 
              onTouchMoveCapture={handleTouchMove}
              className="w-full overflow-x-auto scrollbar-hide mb-4 touch-pan-x pt-2" 
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
             <div style={{ width: `${chartWidth}px`, height: '224px' }} className="cursor-crosshair relative">
                 <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ padding: '10px 0 30px 0' }}>
                     {[0, 25, 50, 75, 100].map((pct, i) => (
                         <line key={i} x1="0" y1={`${pct}%`} x2="100%" y2={`${pct}%`} stroke={theme === 'dark' ? '#3f3f46' : '#cbd5e1'} strokeDasharray="3 3" strokeWidth="1" />
                     ))}
                 </svg>

                 <ComposedChart 
                    width={chartWidth}
                    height={224}
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
                           let unit = '';
                           if (props.dataKey === 'sleep') unit = ' h';
                           else if (props.dataKey === 'nutritionCalories' || props.dataKey === 'activityCalories') unit = ' kcal';
                           else if (props.dataKey === 'activeMinutes') unit = ' m';
                           return [`${formatNumber(value, language)}${unit}`, name];
                       }}
                       cursor={{ fill: theme === 'dark' ? '#27272a' : '#f4f4f5' }} 
                       contentStyle={{ backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', borderRadius: '12px', border: '1px solid ' + t.border, padding: '8px 12px', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
                       itemStyle={{ padding: 0, margin: 0, marginTop: '4px' }} 
                       labelStyle={{ color: theme === 'dark' ? '#a1a1aa' : '#71717a', marginBottom: '4px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }} 
                    />
                    <XAxis dataKey="name" stroke={theme === 'dark' ? '#a1a1aa' : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis domain={yDomain} hide={true} />
                    
                    {activeMetric === 'calories' && (
                        <Line type="step" dataKey="targetCalories" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {activeMetric === 'protein' && (
                        <Line type="step" dataKey="targetProtein" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {activeMetric === 'fat' && (
                        <Line type="step" dataKey="targetFat" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {activeMetric === 'carbs' && (
                        <Line type="step" dataKey="targetCarbs" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {activeMetric === 'delta' && (
                        <>
                            <ReferenceLine y={0} stroke={theme === 'dark' ? '#52525b' : '#d4d4d8'} strokeWidth={1} strokeDasharray="3 3" />
                            <Line type="step" dataKey="targetDelta" stroke={theme === 'dark' ? '#facc15' : '#eab308'} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </>
                    )}

                    {activeObj.type === 'single' ? (
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
