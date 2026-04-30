/**
 * Formats a machine-readable prefix into a human-readable page title.
 * 
 * Example: "ladder_bughouse_ladder_com_omen_" -> "Ladder Bughouse Com Omen -ladder"
 */
export function formatPrefixToTitle(prefix: string): string {
  const parts = prefix.split('_');
  
  const filteredParts = parts.filter(part => {
    const lower = part.toLowerCase();
    return lower.length > 0 && lower !== 'dist' && lower !== 'ladder';
  });

  // Remove duplicates while preserving order
  const uniqueParts = filteredParts.filter((part, index) => {
    return filteredParts.indexOf(part.toLowerCase()) === index;
  });

  const capitalizedParts = uniqueParts.map(part => {
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });

  const titleBase = capitalizedParts.join(' ');
  
  return `${titleBase} -Ladder`;
}
