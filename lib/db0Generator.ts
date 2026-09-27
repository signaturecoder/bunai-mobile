type EntryData = {
  picks: number;
  box: number;
  firstRepeatCount?: number;
  secondRepeatCount?: number;
};

export interface DB0GenerateResult {
  buffer: ArrayBuffer;
  filename: string;
  metadata: {
    entries: EntryData[];
    filename: string;
    repeatCountPositions: number[];
    totalPicks?: number;
    entryCount: number;
  };
}

export async function generateDB0File(
  entries: EntryData[],
  filename: string,
  totalPicks: number,
): Promise<DB0GenerateResult> {
  let finalFilename = filename;
  if (!finalFilename.toUpperCase().endsWith('.DB0') && !finalFilename.toUpperCase().endsWith('.DBO')) {
    finalFilename += '.DB0';
  }

  let baseFilename = finalFilename.replace(/\.[^.]*$/, '');
  baseFilename = baseFilename.substring(0, 8).toUpperCase();

  const header = new Uint8Array(16);
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(baseFilename);
  header.set(filenameBytes.slice(0, 8));

  const hexToBCD = (num: number): number => {
    const str = String(num).padStart(2, '0');
    return parseInt(str, 16);
  };

  const rows: number[] = [];
  entries.forEach((entry) => {
    const picks = Math.max(0, Math.min(99, Number(entry.picks) || 0));
    const box = Math.max(0, Math.min(99, Number(entry.box) || 0));
    rows.push(hexToBCD(picks), hexToBCD(box));
  });

  const finalBuffer = new Uint8Array(1024);
  finalBuffer.fill(0xff);
  finalBuffer.set(header, 0);

  finalBuffer[8] = totalPicks & 0xff;
  finalBuffer[9] = (totalPicks >> 8) & 0xff;

  const totalPicksStr = String(totalPicks).padStart(4, '0');
  const bcdValue = parseInt(totalPicksStr, 16);
  finalBuffer[10] = bcdValue & 0xff;
  finalBuffer[11] = (bcdValue >> 8) & 0xff;
  finalBuffer[12] = 0x00;
  finalBuffer[13] = 0x00;
  finalBuffer[14] = 0x00;
  finalBuffer[15] = 0x00;

  let offset = 16;
  for (let i = 0; i < rows.length; i++) {
    finalBuffer[offset++] = rows[i];
  }

  finalBuffer[offset++] = 0xff;
  finalBuffer[offset++] = 0xff;

  const openingBrackets: Array<{ level: number; count: number }> = [];
  const openRepeats = new Set<number>();

  entries.forEach((entry) => {
    const box = Number(entry.box) || 0;
    if (box >= 10) {
      const level = Math.floor(box / 10);
      if (!openRepeats.has(level)) {
        openRepeats.add(level);
        const count = level === 1
          ? Math.max(0, Math.min(99, Number(entry.firstRepeatCount) || 0))
          : Math.max(0, Math.min(99, Number(entry.secondRepeatCount) || 0));
        openingBrackets.push({ level, count });
      } else {
        openRepeats.delete(level);
      }
    }
  });

  const level1Brackets = openingBrackets.filter((b) => b.level === 1);
  const level2Brackets = openingBrackets.filter((b) => b.level === 2);
  const allCounts = [...level1Brackets.map((b) => b.count), ...level2Brackets.map((b) => b.count)];

  const REPEAT_COUNTS_OFFSET = 0x380;
  const writtenPositions: number[] = [];
  allCounts.forEach((count, index) => {
    const bytePos = REPEAT_COUNTS_OFFSET + index;
    finalBuffer[bytePos] = hexToBCD(count);
    writtenPositions.push(bytePos);
  });

  return {
    buffer: finalBuffer.buffer,
    filename: finalFilename.toUpperCase(),
    metadata: {
      entries,
      filename: finalFilename.toUpperCase(),
      repeatCountPositions: writtenPositions,
      totalPicks,
      entryCount: entries.length,
    },
  };
}