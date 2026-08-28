const citationMarkerPattern = /\[(\d+)\]|【(\d+)】/g;

export function getCitationNumbers(answer: string): number[] {
  return [...answer.matchAll(citationMarkerPattern)].map((match) =>
    Number(match[1] ?? match[2]),
  );
}

export function hasValidCitationMarkers(
  answer: string,
  citationCount: number,
): boolean {
  const numbers = getCitationNumbers(answer);
  return (
    numbers.length > 0 &&
    numbers.every(
      (number) =>
        Number.isInteger(number) && number >= 1 && number <= citationCount,
    )
  );
}

export function removeCitationMarkers(answer: string): string {
  return answer.replace(/\s*(?:\[\d+\]|【\d+】)/g, "");
}
