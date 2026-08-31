const MASTER_NUMBERS = new Set([11, 22, 33]);

function digitSum(value) {
  return String(value || '').replace(/\D/g, '').split('').reduce((sum, digit) => sum + Number(digit), 0);
}

function reduceNumber(value, preserveMaster = true) {
  let number = Math.max(0, Math.floor(Number(value) || 0));
  while (number > 9 && !(preserveMaster && MASTER_NUMBERS.has(number))) number = digitSum(number);
  return number;
}

function theme(number) {
  return ({
    1: 'initiative, independence, and self-direction',
    2: 'cooperation, sensitivity, and relationship awareness',
    3: 'expression, creativity, and communication',
    4: 'structure, craft, and dependable foundations',
    5: 'change, adaptability, and experience',
    6: 'care, responsibility, and stewardship',
    7: 'inquiry, reflection, and depth',
    8: 'agency, resources, and material execution',
    9: 'completion, service, and broad perspective',
    11: 'intuition, inspiration, and heightened sensitivity',
    22: 'large-scale building, systems, and practical vision',
    33: 'teaching, care, and service through expression',
  })[number] || 'reflection and personal meaning';
}

export function calculateBirthNumerology(birthDate) {
  const text = String(birthDate || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw Object.assign(new Error('birth_date must be YYYY-MM-DD'), { status: 400 });
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lifePath = reduceNumber(digitSum(text), true);
  const birthDay = reduceNumber(day, true);
  const attitude = reduceNumber(month + day, true);
  const yearTone = reduceNumber(digitSum(year), true);

  return {
    framework: 'birth_date_numerology',
    method: 'pythagorean_digit_reduction_master_11_22_33',
    life_path: { number: lifePath, theme: theme(lifePath) },
    birth_day: { number: birthDay, theme: theme(birthDay) },
    attitude: { number: attitude, theme: theme(attitude) },
    birth_year_tone: { number: yearTone, theme: theme(yearTone) },
    note: 'Reflective symbolic framework; not a diagnostic or scientific assessment.',
  };
}
