/**
 * Calendar utility functions for generating and managing calendar views
 */

export interface CalendarDay {
    date: Date;
    dayOfMonth: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    isWeekend: boolean;
}

export interface CalendarWeek {
    days: CalendarDay[];
}

/**
 * Generate calendar grid for a given month and year
 * Returns weeks with days, including padding days from previous/next months
 */
export function generateCalendarMonth(
    year: number,
    month: number // 0-11 (JavaScript month format)
): CalendarWeek[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // First day of the month
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const lastDate = lastDay.getDate();

    // Previous month days to fill
    const prevMonthLastDay = new Date(year, month, 0);
    const prevMonthLastDate = prevMonthLastDay.getDate();

    const weeks: CalendarWeek[] = [];
    let currentWeek: CalendarDay[] = [];

    // Fill previous month days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const date = new Date(year, month - 1, prevMonthLastDate - i);
        currentWeek.push({
            date,
            dayOfMonth: prevMonthLastDate - i,
            isCurrentMonth: false,
            isToday: date.getTime() === today.getTime(),
            isWeekend: date.getDay() === 0 || date.getDay() === 6,
        });
    }

    // Fill current month days
    for (let day = 1; day <= lastDate; day++) {
        const date = new Date(year, month, day);
        currentWeek.push({
            date,
            dayOfMonth: day,
            isCurrentMonth: true,
            isToday: date.getTime() === today.getTime(),
            isWeekend: date.getDay() === 0 || date.getDay() === 6,
        });

        // If week is complete (7 days), add to weeks array
        if (currentWeek.length === 7) {
            weeks.push({ days: currentWeek });
            currentWeek = [];
        }
    }

    // Fill next month days to complete the last week
    if (currentWeek.length > 0) {
        let nextMonthDay = 1;
        while (currentWeek.length < 7) {
            const date = new Date(year, month + 1, nextMonthDay);
            currentWeek.push({
                date,
                dayOfMonth: nextMonthDay,
                isCurrentMonth: false,
                isToday: date.getTime() === today.getTime(),
                isWeekend: date.getDay() === 0 || date.getDay() === 6,
            });
            nextMonthDay++;
        }
        weeks.push({ days: currentWeek });
    }

    return weeks;
}

/**
 * Get month name from month number (0-11)
 */
export function getMonthName(month: number): string {
    const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    return monthNames[month] || "";
}

/**
 * Get short day names for calendar header
 */
export function getDayHeaders(): string[] {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
}

/**
 * Format date to ISO string for comparison (YYYY-MM-DD)
 */
export function dateToISOString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
    return dateToISOString(date1) === dateToISOString(date2);
}

/**
 * Get current year and month
 */
export function getCurrentYearMonth(): { year: number; month: number } {
    const now = new Date();
    return {
        year: now.getFullYear(),
        month: now.getMonth(),
    };
}

/**
 * Navigate to previous month
 */
export function getPreviousMonth(year: number, month: number): { year: number; month: number } {
    if (month === 0) {
        return { year: year - 1, month: 11 };
    }
    return { year, month: month - 1 };
}

/**
 * Navigate to next month
 */
export function getNextMonth(year: number, month: number): { year: number; month: number } {
    if (month === 11) {
        return { year: year + 1, month: 0 };
    }
    return { year, month: month + 1 };
}
