function numericParts(version) {
  return String(version).replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left, right) {
  const a = numericParts(left);
  const b = numericParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
