import { NUTRIENTS } from './src/data/nutrition.js';
console.log(NUTRIENTS.map(n => `"${n.key}":number(${n.unit})`).join(','));
