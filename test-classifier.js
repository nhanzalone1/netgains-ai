// Test the classification function
function classifyMessageComplexity(message, isSystemTrigger) {
  if (isSystemTrigger) return 'complex';

  const msgLower = message.toLowerCase().trim();
  const wordCount = msgLower.split(/\s+/).length;

  const simplePatterns = [
    /^(yes|yeah|yep|yup|ok|okay|sure|got it|thanks|thank you|cool|nice|perfect|great|good|k|kk)\.?$/i,
    /^log (it|that|this)\.?$/i,
    /^(add|save|confirm) (it|that|this)\.?$/i,
    /^(sounds good|works for me|let's do it|do it)\.?$/i,
  ];

  for (const pattern of simplePatterns) {
    if (pattern.test(msgLower)) return 'simple';
  }

  const quickQueryPatterns = [
    /^(what's|how much|how many).{0,20}(protein|calories|carbs|fat|macros)\??$/i,
    /^(what did i|did i).{0,20}(eat|log|have)\??$/i,
    /^(am i|how am i).{0,15}(doing|tracking)\??$/i,
  ];

  for (const pattern of quickQueryPatterns) {
    if (pattern.test(msgLower)) return 'simple';
  }

  const complexPatterns = [
    /workout|exercise|training|routine|program|split/i,
    /meal plan|what should i eat|suggest|recommend/i,
    /why|how does|explain|help me understand/i,
    /review|analyze|breakdown|evaluate/i,
    /generate|create|build|design/i,
    /goal|bulk|cut|maintain|weight loss|muscle/i,
    /stall|plateau|not working|stuck/i,
    /injury|pain|hurt|sore/i,
  ];

  for (const pattern of complexPatterns) {
    if (pattern.test(msgLower)) return 'complex';
  }

  if (wordCount <= 3) return 'simple';
  if (wordCount > 10 || /\d+\s*(g|oz|lb|cal|gram|ounce)/i.test(msgLower)) return 'complex';

  return 'complex';
}

// Test cases
const tests = [
  // Simple confirmations
  ['yes', 'simple'],
  ['ok', 'simple'],
  ['log it', 'simple'],
  ['thanks', 'simple'],
  ['got it', 'simple'],
  ['sounds good', 'simple'],
  ['perfect', 'simple'],

  // Quick queries
  ["what's my protein?", 'simple'],
  ['how many calories?', 'simple'],
  ['how am i doing?', 'simple'],
  ['what did i eat today?', 'simple'],

  // Complex - workouts
  ['give me a chest workout', 'complex'],
  ['what should my training split be?', 'complex'],
  ['build me a leg routine', 'complex'],

  // Complex - nutrition advice
  ['what should i eat for dinner?', 'complex'],
  ['suggest a high protein meal', 'complex'],
  ['recommend something for post workout', 'complex'],

  // Complex - explanations
  ['why am i not losing weight?', 'complex'],
  ['explain progressive overload', 'complex'],
  ['how does creatine work?', 'complex'],

  // Complex - food logging with amounts
  ['i had 200g chicken breast and 150g rice', 'complex'],
  ['just ate 4 eggs and 2 slices of toast', 'complex'],
  ['logged 150g protein today', 'complex'],

  // Complex - goals
  ['i want to start bulking', 'complex'],
  ['should i cut or maintain?', 'complex'],

  // Edge cases
  ['hello', 'simple'],  // short, no complex pattern
  ['hey', 'simple'],
  ['sup', 'simple'],
  ['good morning coach', 'complex'],  // >3 words, defaults to complex
  ['i just finished my workout', 'complex'],  // contains 'workout'
  ['my shoulder hurts', 'complex'],  // injury
];

console.log('Testing message classification:\n');
let passed = 0;
let failed = 0;

for (const [msg, expected] of tests) {
  const result = classifyMessageComplexity(msg, false);
  const status = result === expected ? '✓' : '✗';
  if (result === expected) passed++;
  else failed++;
  console.log(`${status} "${msg}" → ${result}${result !== expected ? ` (expected: ${expected})` : ''}`);
}

console.log(`\n${passed}/${tests.length} tests passed`);

if (failed > 0) {
  console.log('\nFailed tests need pattern adjustments.');
}
