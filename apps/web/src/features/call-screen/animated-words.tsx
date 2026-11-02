/**
 * Text whose words fade and sharpen in as they arrive (D-022). Keys are word positions, so a
 * word already shown is never animated again while the text grows.
 */
export function AnimatedWords({ text }: { text: string }) {
  const words = text.split(/(?<=\s)/);
  return (
    <>
      {words.map((word, wordIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a word's position is its identity here
        <span key={wordIndex} className="caption-word">
          {word}
        </span>
      ))}
    </>
  );
}
