export function normalizeAnswer(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, ' ');
}
function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + 1);
            }
        }
    }
    return matrix[b.length][a.length];
}
export function answersMatch(target, answer) {
    const normalizedTarget = normalizeAnswer(target);
    const normalizedAnswer = normalizeAnswer(answer);
    if (normalizedTarget === normalizedAnswer) {
        return true;
    }
    if (normalizedTarget.length < 4 || !normalizedAnswer) {
        return false;
    }
    return levenshtein(normalizedTarget, normalizedAnswer) <= 1;
}
