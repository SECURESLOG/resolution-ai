/**
 * Public Holiday Detection
 *
 * Provides public holidays for various countries.
 * Currently supports: UK, US, AU, CA, DE, FR, IN
 */

import { format, getYear, addDays, startOfYear, addWeeks, nextMonday, previousMonday, isSameDay } from "date-fns";

interface PublicHoliday {
  date: Date;
  name: string;
  observed?: Date; // If the holiday is observed on a different date
}

// Easter calculation (Anonymous Gregorian algorithm)
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// Get nth weekday of a month (e.g., 4th Thursday of November)
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = firstOfMonth.getDay();
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  const nthDay = 1 + dayOffset + (n - 1) * 7;
  return new Date(year, month, nthDay);
}

// Get last weekday of a month
function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastOfMonth = new Date(year, month + 1, 0);
  const lastDay = lastOfMonth.getDate();
  const lastWeekday = lastOfMonth.getDay();
  let dayOffset = lastWeekday - weekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month, lastDay - dayOffset);
}

// UK Public Holidays
function getUKHolidays(year: number): PublicHoliday[] {
  const easter = calculateEaster(year);
  const holidays: PublicHoliday[] = [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: getNthWeekdayOfMonth(year, 4, 1, 1), name: "Early May Bank Holiday" }, // First Monday of May
    { date: getLastWeekdayOfMonth(year, 4, 1), name: "Spring Bank Holiday" }, // Last Monday of May
    { date: getLastWeekdayOfMonth(year, 7, 1), name: "Summer Bank Holiday" }, // Last Monday of August
    { date: new Date(year, 11, 25), name: "Christmas Day" },
    { date: new Date(year, 11, 26), name: "Boxing Day" },
  ];

  // Handle weekends - UK observes substitute days
  return holidays.map(h => {
    const day = h.date.getDay();
    if (day === 0) { // Sunday -> Monday
      return { ...h, observed: addDays(h.date, 1) };
    } else if (day === 6) { // Saturday -> Monday
      return { ...h, observed: addDays(h.date, 2) };
    }
    return h;
  });
}

// US Public Holidays
function getUSHolidays(year: number): PublicHoliday[] {
  return [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: getNthWeekdayOfMonth(year, 0, 1, 3), name: "Martin Luther King Jr. Day" }, // Third Monday of January
    { date: getNthWeekdayOfMonth(year, 1, 1, 3), name: "Presidents' Day" }, // Third Monday of February
    { date: getLastWeekdayOfMonth(year, 4, 1), name: "Memorial Day" }, // Last Monday of May
    { date: new Date(year, 5, 19), name: "Juneteenth" },
    { date: new Date(year, 6, 4), name: "Independence Day" },
    { date: getNthWeekdayOfMonth(year, 8, 1, 1), name: "Labor Day" }, // First Monday of September
    { date: getNthWeekdayOfMonth(year, 9, 1, 2), name: "Columbus Day" }, // Second Monday of October
    { date: new Date(year, 10, 11), name: "Veterans Day" },
    { date: getNthWeekdayOfMonth(year, 10, 4, 4), name: "Thanksgiving" }, // Fourth Thursday of November
    { date: new Date(year, 11, 25), name: "Christmas Day" },
  ];
}

// Australian Public Holidays (National only)
function getAUHolidays(year: number): PublicHoliday[] {
  const easter = calculateEaster(year);
  return [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: new Date(year, 0, 26), name: "Australia Day" },
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: addDays(easter, -1), name: "Easter Saturday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: new Date(year, 3, 25), name: "ANZAC Day" },
    { date: getNthWeekdayOfMonth(year, 5, 1, 2), name: "Queen's Birthday" }, // Second Monday of June
    { date: new Date(year, 11, 25), name: "Christmas Day" },
    { date: new Date(year, 11, 26), name: "Boxing Day" },
  ];
}

// Canadian Public Holidays (Federal)
function getCAHolidays(year: number): PublicHoliday[] {
  const easter = calculateEaster(year);
  return [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: getNthWeekdayOfMonth(year, 4, 1, 1) > new Date(year, 4, 24)
        ? getNthWeekdayOfMonth(year, 4, 1, 1)
        : previousMonday(new Date(year, 4, 25)), name: "Victoria Day" },
    { date: new Date(year, 6, 1), name: "Canada Day" },
    { date: getNthWeekdayOfMonth(year, 8, 1, 1), name: "Labour Day" },
    { date: getNthWeekdayOfMonth(year, 9, 1, 2), name: "Thanksgiving" },
    { date: new Date(year, 10, 11), name: "Remembrance Day" },
    { date: new Date(year, 11, 25), name: "Christmas Day" },
    { date: new Date(year, 11, 26), name: "Boxing Day" },
  ];
}

// German Public Holidays (National)
function getDEHolidays(year: number): PublicHoliday[] {
  const easter = calculateEaster(year);
  return [
    { date: new Date(year, 0, 1), name: "Neujahr" },
    { date: addDays(easter, -2), name: "Karfreitag" },
    { date: addDays(easter, 1), name: "Ostermontag" },
    { date: new Date(year, 4, 1), name: "Tag der Arbeit" },
    { date: addDays(easter, 39), name: "Christi Himmelfahrt" },
    { date: addDays(easter, 50), name: "Pfingstmontag" },
    { date: new Date(year, 9, 3), name: "Tag der Deutschen Einheit" },
    { date: new Date(year, 11, 25), name: "Erster Weihnachtstag" },
    { date: new Date(year, 11, 26), name: "Zweiter Weihnachtstag" },
  ];
}

// French Public Holidays
function getFRHolidays(year: number): PublicHoliday[] {
  const easter = calculateEaster(year);
  return [
    { date: new Date(year, 0, 1), name: "Jour de l'An" },
    { date: addDays(easter, 1), name: "Lundi de Pâques" },
    { date: new Date(year, 4, 1), name: "Fête du Travail" },
    { date: new Date(year, 4, 8), name: "Victoire 1945" },
    { date: addDays(easter, 39), name: "Ascension" },
    { date: addDays(easter, 50), name: "Lundi de Pentecôte" },
    { date: new Date(year, 6, 14), name: "Fête Nationale" },
    { date: new Date(year, 7, 15), name: "Assomption" },
    { date: new Date(year, 10, 1), name: "Toussaint" },
    { date: new Date(year, 10, 11), name: "Armistice" },
    { date: new Date(year, 11, 25), name: "Noël" },
  ];
}

// Indian Public Holidays (National)
function getINHolidays(year: number): PublicHoliday[] {
  // Note: India has many regional holidays. These are national holidays only.
  return [
    { date: new Date(year, 0, 26), name: "Republic Day" },
    { date: new Date(year, 7, 15), name: "Independence Day" },
    { date: new Date(year, 9, 2), name: "Gandhi Jayanti" },
  ];
}

// Country code to holiday function mapping
const HOLIDAY_FUNCTIONS: Record<string, (year: number) => PublicHoliday[]> = {
  UK: getUKHolidays,
  GB: getUKHolidays,
  US: getUSHolidays,
  AU: getAUHolidays,
  CA: getCAHolidays,
  DE: getDEHolidays,
  FR: getFRHolidays,
  IN: getINHolidays,
};

// Supported countries with display names
export const SUPPORTED_COUNTRIES = [
  { code: "UK", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IN", name: "India" },
];

/**
 * Get public holidays for a specific country and year
 */
export function getPublicHolidays(countryCode: string, year: number): PublicHoliday[] {
  const getHolidays = HOLIDAY_FUNCTIONS[countryCode.toUpperCase()];
  if (!getHolidays) {
    // Default to UK if country not supported
    return getUKHolidays(year);
  }
  return getHolidays(year);
}

/**
 * Get public holidays for a date range
 */
export function getPublicHolidaysInRange(
  countryCode: string,
  startDate: Date,
  endDate: Date
): PublicHoliday[] {
  const startYear = getYear(startDate);
  const endYear = getYear(endDate);

  const holidays: PublicHoliday[] = [];

  for (let year = startYear; year <= endYear; year++) {
    const yearHolidays = getPublicHolidays(countryCode, year);
    holidays.push(...yearHolidays.filter(h => {
      const effectiveDate = h.observed || h.date;
      return effectiveDate >= startDate && effectiveDate <= endDate;
    }));
  }

  return holidays;
}

/**
 * Check if a specific date is a public holiday
 */
export function isPublicHoliday(countryCode: string, date: Date): PublicHoliday | null {
  const year = getYear(date);
  const holidays = getPublicHolidays(countryCode, year);

  return holidays.find(h => {
    const effectiveDate = h.observed || h.date;
    return isSameDay(effectiveDate, date);
  }) || null;
}

/**
 * Get upcoming public holidays (next N months)
 */
export function getUpcomingHolidays(countryCode: string, months: number = 12): PublicHoliday[] {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + months);

  return getPublicHolidaysInRange(countryCode, today, endDate);
}
