// Avatar color gradients based on first letter
const avatarColorMap: Record<string, string> = {
  'A': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'B': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'C': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'D': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'E': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'F': 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'G': 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'H': 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  'I': 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'J': 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
  'K': 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  'L': 'linear-gradient(135deg, #f77062 0%, #fe5196 100%)',
  'M': 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'N': 'linear-gradient(135deg, #e68d8d 0%, #fdb99b 100%)',
  'O': 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
  'P': 'linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)',
  'Q': 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
  'R': 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
  'S': 'linear-gradient(135deg, #ffd3a5 0%, #fd6585 100%)',
  'T': 'linear-gradient(135deg, #96fbc4 0%, #f9f586 100%)',
  'U': 'linear-gradient(135deg, #ebc0fd 0%, #d9ded8 100%)',
  'V': 'linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)',
  'W': 'linear-gradient(135deg, #48c6ef 0%, #6f86d6 100%)',
  'X': 'linear-gradient(135deg, #feada6 0%, #f5efef 100%)',
  'Y': 'linear-gradient(135deg, #a6ffcb 0%, #12d8fa 100%)',
  'Z': 'linear-gradient(135deg, #fda085 0%, #f6d365 100%)',
};

// Default gradient for non-letter characters
const defaultGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

export function getAvatarColor(name: string): string {
  if (!name || name.length === 0) return defaultGradient;

  const firstLetter = name.charAt(0).toUpperCase();
  return avatarColorMap[firstLetter] || defaultGradient;
}
