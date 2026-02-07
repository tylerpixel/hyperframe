// Curated word list - 100 simple, memorable, easy-to-type words
const words = [
  'apple', 'arrow', 'badge', 'beach', 'bird',
  'block', 'blue', 'boat', 'book', 'box',
  'brave', 'bread', 'brick', 'bridge', 'bright',
  'calm', 'camp', 'candle', 'card', 'cash',
  'chain', 'chair', 'charm', 'chase', 'chess',
  'city', 'clean', 'clear', 'cliff', 'clock',
  'cloud', 'coast', 'coral', 'crane', 'crown',
  'dance', 'dawn', 'delta', 'dream', 'drum',
  'eagle', 'earth', 'ember', 'empty', 'event',
  'fall', 'fern', 'field', 'fire', 'flash',
  'float', 'flow', 'forest', 'fox', 'frame',
  'fresh', 'frost', 'fruit', 'gaze', 'ghost',
  'glass', 'globe', 'gold', 'grain', 'grape',
  'green', 'grove', 'guide', 'heart', 'hero',
  'honey', 'house', 'iron', 'jade', 'jazz',
  'jump', 'king', 'lake', 'lamp', 'leaf',
  'light', 'lion', 'lucky', 'lunar', 'magic',
  'maple', 'marsh', 'mask', 'metal', 'mint',
  'moon', 'music', 'navy', 'night', 'north',
  'ocean', 'olive', 'orbit', 'owl', 'paper',
  'park', 'peak', 'pearl', 'pilot', 'pine',
  'pixel', 'plain', 'plant', 'plaza', 'pond',
  'pulse', 'quick', 'quiet', 'rain', 'rapid',
  'raven', 'ridge', 'river', 'robin', 'rock',
  'rose', 'royal', 'ruby', 'sage', 'sand',
  'scale', 'seed', 'shade', 'shell', 'shore',
  'silk', 'silver', 'sky', 'snow', 'solar',
  'spark', 'spice', 'spring', 'star', 'steam',
  'steel', 'stone', 'storm', 'sugar', 'sun',
  'swift', 'tiger', 'timber', 'tower', 'trail',
  'tree', 'tulip', 'urban', 'vapor', 'velvet',
  'vine', 'violet', 'water', 'wave', 'west',
  'wheat', 'wild', 'wind', 'winter', 'wolf',
  'wood', 'yard', 'zebra', 'zero', 'zone'
];

function generateCode() {
  const word1 = words[Math.floor(Math.random() * words.length)];
  const word2 = words[Math.floor(Math.random() * words.length)];
  return `${word1}-${word2}`;
}

function isValidCode(code) {
  const parts = code.split('-');
  if (parts.length !== 2) return false;
  return words.includes(parts[0]) && words.includes(parts[1]);
}

module.exports = { words, generateCode, isValidCode };
