const REVIEW_INTERVALS = [
    0,
    1,
    3,
    7,
    14,
    30,
];
const DAY = 24 * 60 * 60 * 1000;
const WRONG_REVIEW_DELAY = 10 * 60 * 1000;
export function calculateNextReview(progress, correct) {
    const now = Date.now();
    /*
     * Wrong answer:
     *
     * Review the word again after
     * a short delay instead of immediately.
     */
    if (!correct) {
        return (now +
            WRONG_REVIEW_DELAY);
    }
    /*
     * Correct answer:
     *
     * Use the current learning level
     * to determine the next interval.
     *
     * 0 → today
     * 1 → 1 day
     * 2 → 3 days
     * 3 → 7 days
     * 4 → 14 days
     * 5 → 30 days
     */
    const level = Math.min(Math.max(progress.level, 0), REVIEW_INTERVALS.length - 1);
    const days = REVIEW_INTERVALS[level];
    return (now +
        days * DAY);
}
