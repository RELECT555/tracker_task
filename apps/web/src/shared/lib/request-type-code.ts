const CYR_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Транслит + slug: «Согласование договора» → `soglasovanie_dogovora`. */
export function slugifyRequestTypeCode(source: string, fallback = 'request_type'): string {
  const transliterated = source
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => {
      if (CYR_TO_LAT[char] !== undefined) return CYR_TO_LAT[char];
      if (/[a-z0-9]/.test(char)) return char;
      if (/[\s\-–—./\\]+/.test(char)) return '_';
      return '';
    })
    .join('');

  const slug = transliterated
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!slug) return fallback;
  if (/^[0-9]/.test(slug)) return `${fallback}_${slug}`;
  return slug.slice(0, 50);
}

/** Убирает недопустимые символы при ручном вводе кода. */
export function sanitizeRequestTypeCodeInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 50);
}

export function isValidRequestTypeCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

export const REQUEST_TYPE_CODE_HINT =
  'Заполняется из названия автоматически. Можно поправить: только латиница, цифры и _.';
