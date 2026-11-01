/**
 * Utility functions for academic department codes and acronyms.
 * Ensures consistent canonical abbreviations across all views
 * (e.g. "Computer Science and Engineering" -> "CSE", not "CSA").
 */

const KNOWN_DEPARTMENT_CODES: Record<string, string> = {
  // Computer Science & Engineering
  'computer science and engineering': 'CSE',
  'computer science & engineering': 'CSE',
  'computer science engineering': 'CSE',
  'computer science': 'CSE',
  'b.tech computer science and engineering': 'CSE',
  'btech cse': 'CSE',
  'cse': 'CSE',

  // Machine Learning & AI
  'computer science and machine learning': 'CSM',
  'computer science & machine learning': 'CSM',
  'computer science machine learning': 'CSM',
  'computer science and artificial intelligence': 'AIML',
  'artificial intelligence and machine learning': 'AIML',
  'artificial intelligence & machine learning': 'AIML',
  'artificial intelligence and machine learning engineering': 'AIML',
  'ai & ml': 'AIML',
  'ai and ml': 'AIML',
  'aiml': 'AIML',
  'csm': 'CSM',

  // Data Science
  'computer science and data science': 'CSD',
  'computer science & data science': 'CSD',
  'computer science data science': 'CSD',
  'artificial intelligence and data science': 'AIDS',
  'artificial intelligence & data science': 'AIDS',
  'ai & ds': 'AIDS',
  'ai and ds': 'AIDS',
  'aids': 'AIDS',
  'csd': 'CSD',
  'data science': 'DS',

  // Business Systems & IT
  'computer science and business systems': 'CSBS',
  'computer science & business systems': 'CSBS',
  'csbs': 'CSBS',
  'computer science and information technology': 'CSIT',
  'computer science & information technology': 'CSIT',
  'csit': 'CSIT',
  'information technology': 'IT',
  'it': 'IT',

  // Electronics & Electrical
  'electronics and communication engineering': 'ECE',
  'electronics & communication engineering': 'ECE',
  'electronics communication engineering': 'ECE',
  'electronics and communication': 'ECE',
  'electronics & communication': 'ECE',
  'ece': 'ECE',
  'electrical and electronics engineering': 'EEE',
  'electrical & electronics engineering': 'EEE',
  'electrical electronics engineering': 'EEE',
  'electrical and electronics': 'EEE',
  'electrical & electronics': 'EEE',
  'electrical engineering': 'EEE',
  'eee': 'EEE',

  // Mechanical, Civil & Other Core Engineering
  'mechanical engineering': 'MECH',
  'mech': 'MECH',
  'civil engineering': 'CIVIL',
  'civil': 'CIVIL',
  'chemical engineering': 'CHEM',
  'chem': 'CHEM',
  'aerospace engineering': 'AERO',
  'aero': 'AERO',
  'aeronautical engineering': 'AERO',
  'biotechnology': 'BT',
  'biotechnology engineering': 'BT',
  'biomedical engineering': 'BME',
  'automobile engineering': 'AUTO',
};

// Stop words to ignore when generating dynamic acronyms
const STOP_WORDS = new Set(['and', '&', 'of', 'in', 'the', 'for', 'a', 'an', 'to', 'with']);

/**
 * Returns the standard clean department code / abbreviation.
 * Never includes "and" or other stop words in the abbreviation.
 * 
 * @example
 * getDepartmentCode('Computer Science and Engineering') // 'CSE'
 * getDepartmentCode('Electronics and Communication Engineering') // 'ECE'
 * getDepartmentCode('Computer Science and Machine Learning') // 'CSM'
 */
export const getDepartmentCode = (deptOrName: any): string => {
  if (!deptOrName) return 'GEN';

  const rawName = typeof deptOrName === 'string'
    ? deptOrName
    : (deptOrName.name || deptOrName.department_name || '');

  const rawCode = typeof deptOrName === 'object'
    ? (deptOrName.code || deptOrName.department_code)
    : '';

  // 1. If explicit code exists and is a valid short code (e.g. "CSE", "ECE"), use it
  if (rawCode && typeof rawCode === 'string') {
    const trimmedCode = rawCode.trim().toUpperCase();
    if (trimmedCode.length >= 2 && trimmedCode.length <= 6 && !trimmedCode.includes(' ')) {
      return trimmedCode;
    }
  }

  const cleanName = rawName.trim().toLowerCase();
  if (!cleanName) return 'GEN';

  // 2. Exact match in canonical department dictionary
  if (KNOWN_DEPARTMENT_CODES[cleanName]) {
    return KNOWN_DEPARTMENT_CODES[cleanName];
  }

  // 3. Dynamic acronym generation (strictly ignoring stop words like "and")
  const words: string[] = cleanName
    .split(/[\s,&/()\-]+/)
    .map((w: string): string => w.replace(/[^a-z0-9]/gi, '').trim())
    .filter((w: string): boolean => w.length > 0 && !STOP_WORDS.has(w));

  if (words.length === 0) {
    return rawName.slice(0, 3).toUpperCase();
  }

  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }

  if (words.length === 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  if (words.length === 3) {
    return (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  }

  // 4 words e.g. "Computer Science Machine Learning" -> "CSM"
  if (words.length === 4) {
    if (words[0] === 'computer' && words[1] === 'science') {
      return ('CS' + words[2][0]).toUpperCase();
    }
    return (words[0][0] + words[1][0] + words[2][0] + words[3][0]).toUpperCase().slice(0, 4);
  }

  // 5+ words: first letter of each significant word up to 4 chars
  return words.map((w: string): string => w[0]).join('').toUpperCase().slice(0, 4);
};
