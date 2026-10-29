/** The middle value, or the mean of the two middle values. `null` for an empty list. */
export function calculateMedian(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sortedValues = [...values].sort((first, second) => first - second);
  const middleIndex = Math.floor(sortedValues.length / 2);
  const middleValue = sortedValues[middleIndex] as number;
  if (sortedValues.length % 2 === 1) {
    return middleValue;
  }
  return ((sortedValues[middleIndex - 1] as number) + middleValue) / 2;
}
