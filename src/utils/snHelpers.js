/**
 * Helper to parse category name into unique S/N category codes
 * @param {string} categoryName 
 * @returns {{ categoryCode: string, isLcdOrLed: boolean }}
 */
export function getCategorySnInfo(categoryName) {
  const normalizedCategory = (categoryName || '').trim().toLowerCase();
  let categoryCode = 'XXX';
  let isLcdOrLed = false;

  if (normalizedCategory.includes('adaptor') || normalizedCategory.includes('charger')) {
    categoryCode = 'ADP';
  } else if (normalizedCategory.includes('baterai') || normalizedCategory.includes('battery')) {
    categoryCode = 'BAT';
  } else if (normalizedCategory.includes('keyboard')) {
    categoryCode = 'KBD';
  } else if (normalizedCategory.includes('touchpad')) {
    categoryCode = 'TPD';
  } else if (normalizedCategory.includes('lcd') || normalizedCategory.includes('led')) {
    categoryCode = 'LED';
    isLcdOrLed = true;
  } else if (normalizedCategory) {
    categoryCode = normalizedCategory.substring(0, 3).toUpperCase().padEnd(3, 'X');
  }

  return { categoryCode, isLcdOrLed };
}
