/**
 * Text parsing and rendering engine for InfoGraphic Generator Studio
 * Handles inline highlighting via <red> or <emp> tags and dynamic box fitting.
 */

/**
 * Parses raw text input containing XML-like tags into a structured object.
 * Tolerates malformed or unclosed tags gracefully.
 */
function parseXMLText(text) {
  const result = {
    title: '',
    sections: Array.from({ length: 5 }, () => ({ row1: '', row2: '', row3: '' }))
  };

  if (!text) return result;

  // 1. Extract Title
  const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // 2. Extract Sections 1 to 5
  for (let i = 1; i <= 5; i++) {
    const sectionRegex = new RegExp(`<section${i}>([\\s\\S]*?)<\/section${i}>`, 'i');
    const sectionMatch = text.match(sectionRegex);
    if (sectionMatch) {
      const sectionContent = sectionMatch[1];
      const r1Match = sectionContent.match(/<row1>([\s\S]*?)<\/row1>/i);
      const r2Match = sectionContent.match(/<row2>([\s\S]*?)<\/row2>/i);
      const r3Match = sectionContent.match(/<row3>([\s\S]*?)<\/row3>/i);

      result.sections[i - 1].row1 = r1Match ? r1Match[1].trim() : '';
      result.sections[i - 1].row2 = r2Match ? r2Match[1].trim() : '';
      result.sections[i - 1].row3 = r3Match ? r3Match[1].trim() : '';
    }
  }

  return result;
}

/**
 * Tokenizes text character-by-character to parse inline style tags like <red> or <emp>.
 * Returns an array of objects: { char: String, isRed: Boolean }
 */
function tokenizeText(text) {
  const tokens = [];
  if (!text) return tokens;

  let i = 0;
  let isRed = false;

  while (i < text.length) {
    if (text.startsWith('<emp>', i) || text.startsWith('<red>', i)) {
      isRed = true;
      i += 5; // length of tag
    } else if (text.startsWith('</emp>', i) || text.startsWith('</red>', i)) {
      isRed = false;
      i += 6; // length of tag
    } else {
      tokens.push({ char: text[i], isRed: isRed });
      i++;
    }
  }

  return tokens;
}

/**
 * Splits token arrays by newlines ONLY. Used to support custom newlines for the Title.
 */
function splitTokensByNewline(tokensArray) {
  const lines = [];
  let currentLine = [];

  for (let i = 0; i < tokensArray.length; i++) {
    const token = tokensArray[i];
    if (token.char === '\n') {
      lines.push(currentLine);
      currentLine = [];
    } else {
      currentLine.push(token);
    }
  }
  
  if (currentLine.length > 0 || lines.length === 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Wraps styled character tokens based on a max width. Handles hybrid Japanese (character wrap) 
 * and English (word wrap) seamlessly.
 * Returns an array of lines, where each line is an array of token objects.
 */
function wrapStyledText(ctx, tokensArray, maxWidth) {
  if (!tokensArray || tokensArray.length === 0) return [];

  // Helper to check CJK
  const isCJK = char => /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(char);

  const words = [];
  let currentWord = [];

  // Group tokens into "words"
  for (let i = 0; i < tokensArray.length; i++) {
    const token = tokensArray[i];
    const char = token.char;

    if (isCJK(char) || char === ' ' || char === '\n') {
      if (currentWord.length > 0) {
        words.push(currentWord);
        currentWord = [];
      }
      words.push([token]);
    } else {
      currentWord.push(token);
    }
  }
  if (currentWord.length > 0) {
    words.push(currentWord);
  }

  const lines = [];
  let currentLine = [];

  // Helper to measure token array width
  const measureLine = (lineTokens) => {
    const str = lineTokens.map(t => t.char).join('');
    return ctx.measureText(str).width;
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (word.length === 1 && word[0].char === '\n') {
      lines.push(currentLine);
      currentLine = [];
      continue;
    }

    if (word.length === 1 && word[0].char === ' ' && currentLine.length === 0) {
      continue; // Skip leading space
    }

    const testLine = currentLine.concat(word);
    const width = measureLine(testLine);

    if (width > maxWidth && currentLine.length > 0) {
      const wordWidth = measureLine(word);
      if (wordWidth > maxWidth && !(word.length === 1 && word[0].char === ' ')) {
        // Split long words character-by-character
        for (let j = 0; j < word.length; j++) {
          const token = word[j];
          const testCharLine = currentLine.concat([token]);
          if (measureLine(testCharLine) > maxWidth) {
            lines.push(currentLine);
            currentLine = [token];
          } else {
            currentLine = testCharLine;
          }
        }
      } else {
        lines.push(currentLine);
        currentLine = (word.length === 1 && word[0].char === ' ') ? [] : word;
      }
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Performs dynamic fit-to-box rendering on the target canvas context.
 * Adjusts font sizes iteratively to ensure all text fits inside their boxes.
 */
function renderTextOnCanvas(ctx, parsedText, coords) {
  const fontFam = "'Segoe UI', 'Noto Sans JP', sans-serif";
  ctx.textBaseline = 'top';

  // Charcoal & Red Color Palette
  const mainCharcoal = '#333333';
  const secondaryCharcoal = '#555555';
  const emphasisRed = '#E63946';

  // Get canvas width and height for relative footer offsets
  const originalWidth = ctx.canvas.width;
  const originalHeight = ctx.canvas.height;

  // 1. Render Title (Strictly wraps on user explicit newlines only, scales down to fit)
  if (parsedText.title && coords.title) {
    const box = coords.title;
    let s = 60; // Title Font Size basic at 60px
    const minS = 16;
    
    const titleTokens = tokenizeText(parsedText.title);
    const titleLines = splitTokensByNewline(titleTokens);
    let titleTotalHeight = 0;

    // Search for a font size that fits in width (1 line unless split by user) and height
    while (s >= minS) {
      ctx.font = `bold ${s}px ${fontFam}`;
      
      let allLinesFit = true;
      for (let i = 0; i < titleLines.length; i++) {
        const lineStr = titleLines[i].map(t => t.char).join('');
        if (ctx.measureText(lineStr).width > box.w) {
          allLinesFit = false;
          break;
        }
      }

      titleTotalHeight = titleLines.length > 0 
        ? (titleLines.length - 1) * (s * 1.35) + s 
        : 0;

      if (allLinesFit && titleTotalHeight <= box.h) {
        break;
      }
      s -= 1;
    }

    // Draw Title (centered horizontally and vertically)
    ctx.font = `bold ${s}px ${fontFam}`;
    ctx.textAlign = 'left';
    
    const titleStartY = box.y + (box.h - titleTotalHeight) / 2;

    titleLines.forEach((line, index) => {
      const lineStr = line.map(t => t.char).join('');
      const lineWidth = ctx.measureText(lineStr).width;
      
      let currentX = box.x + (box.w - lineWidth) / 2;
      const currentY = titleStartY + index * (s * 1.35);

      line.forEach(token => {
        ctx.fillStyle = token.isRed ? emphasisRed : mainCharcoal;
        ctx.fillText(token.char, currentX, currentY);
        currentX += ctx.measureText(token.char).width;
      });
    });
  }

  // 2. Render Sections 1 to 5
  for (let i = 0; i < 5; i++) {
    const sec = parsedText.sections[i];
    const box = coords.sections[i];
    if (!sec || !box) continue;

    // Skip section if empty
    if (!sec.row1 && !sec.row2 && !sec.row3) continue;

    let scale = 1.0; // Scaling factor starting at 1.0 (corresponds to Row 1 = 40px, Row 2/3 = 30px)
    const minScale = 0.2;
    
    const r1Tokens = tokenizeText(sec.row1);
    const r2Tokens = tokenizeText(sec.row2);
    const r3Tokens = tokenizeText(sec.row3);

    let r1Lines = [], r2Lines = [], r3Lines = [];
    let r1H = 0, r2H = 0, r3H = 0;
    let totalH = 0;
    let s1 = 0, s2 = 0, s3 = 0;
    let gap12 = 0, gap23 = 0;

    // Search for a fitting scale factor
    while (scale >= minScale) {
      s1 = Math.round(40 * scale); // Row 1 basic is 40px
      s2 = Math.round(30 * scale); // Row 2 basic is 30px
      s3 = Math.round(30 * scale); // Row 3 basic is 30px
      
      gap12 = Math.round(15 * scale); // Space between Row 1 and Row 2
      gap23 = Math.round(10 * scale); // Space between Row 2 and Row 3
      
      // Calculate wraps and heights
      if (sec.row1) {
        ctx.font = `bold ${s1}px ${fontFam}`;
        r1Lines = wrapStyledText(ctx, r1Tokens, box.w);
        r1H = r1Lines.length > 0 ? (r1Lines.length - 1) * (s1 * 1.3) + s1 : 0;
      } else {
        r1Lines = [];
        r1H = 0;
      }

      if (sec.row2) {
        ctx.font = `bold ${s2}px ${fontFam}`;
        r2Lines = wrapStyledText(ctx, r2Tokens, box.w);
        r2H = r2Lines.length > 0 ? (r2Lines.length - 1) * (s2 * 1.35) + s2 : 0;
      } else {
        r2Lines = [];
        r2H = 0;
      }

      if (sec.row3) {
        ctx.font = `bold ${s3}px ${fontFam}`;
        r3Lines = wrapStyledText(ctx, r3Tokens, box.w);
        r3H = r3Lines.length > 0 ? (r3Lines.length - 1) * (s3 * 1.35) + s3 : 0;
      } else {
        r3Lines = [];
        r3H = 0;
      }

      // Sum height and calculate gaps
      totalH = 0;
      let lastBottom = 0;
      if (r1H > 0) {
        totalH += r1H;
        lastBottom = 1;
      }
      if (r2H > 0) {
        if (lastBottom === 1) totalH += gap12;
        totalH += r2H;
        lastBottom = 2;
      }
      if (r3H > 0) {
        if (lastBottom === 1) totalH += gap12 + gap23;
        else if (lastBottom === 2) totalH += gap23;
        totalH += r3H;
      }

      if (totalH <= box.h) {
        break;
      }
      scale -= 0.02;
    }

    // Draw Section Text (all bold)
    ctx.textAlign = 'left';
    let currentY = box.y + (box.h - totalH) / 2;

    // Draw Row 1 (Header Row)
    if (r1Lines.length > 0) {
      ctx.font = `bold ${s1}px ${fontFam}`;
      r1Lines.forEach(line => {
        let currentX = box.x;
        line.forEach(token => {
          ctx.fillStyle = token.isRed ? emphasisRed : mainCharcoal;
          ctx.fillText(token.char, currentX, currentY);
          currentX += ctx.measureText(token.char).width;
        });
        currentY += s1 * 1.3;
      });
      if (r2Lines.length > 0) {
        currentY += gap12 - (s1 * 0.3);
      } else if (r3Lines.length > 0) {
        currentY += (gap12 + gap23) - (s1 * 0.3);
      }
    }

    // Draw Row 2
    if (r2Lines.length > 0) {
      ctx.font = `bold ${s2}px ${fontFam}`;
      r2Lines.forEach(line => {
        let currentX = box.x;
        line.forEach(token => {
          ctx.fillStyle = token.isRed ? emphasisRed : secondaryCharcoal;
          ctx.fillText(token.char, currentX, currentY);
          currentX += ctx.measureText(token.char).width;
        });
        currentY += s2 * 1.35;
      });
      if (r3Lines.length > 0) {
        currentY += gap23 - (s2 * 0.35);
      }
    }

    // Draw Row 3
    if (r3Lines.length > 0) {
      ctx.font = `bold ${s3}px ${fontFam}`;
      r3Lines.forEach(line => {
        let currentX = box.x;
        line.forEach(token => {
          ctx.fillStyle = token.isRed ? emphasisRed : secondaryCharcoal;
          ctx.fillText(token.char, currentX, currentY);
          currentX += ctx.measureText(token.char).width;
        });
        currentY += s3 * 1.35;
      });
    }
  }

  // 3. Render Footer (Branding & Bookmark CTA)
  // Scale footer relative to active template resolution
  const scaleX = originalWidth / 1200;
  const scaleY = originalHeight / 1500;
  const footerS = Math.round(28 * Math.min(scaleX, scaleY));
  
  ctx.font = `bold ${footerS}px ${fontFam}`;
  ctx.fillStyle = '#1E314B'; // Navy color matches template border
  ctx.textBaseline = 'middle';
  
  const footerY = 1458 * scaleY; // Vertical center of the footer space (line is at 1425)

  // Bottom Left: @farron_us
  ctx.textAlign = 'left';
  const leftX = 80 * scaleX;
  ctx.fillText('@farron_us', leftX, footerY);

  // Bottom Right: Bookmark CTA + Bookmark Icon
  ctx.textAlign = 'right';
  const rightX = 1120 * scaleX;
  const iconW = 24 * scaleX;
  const iconH = 32 * scaleY;
  
  // Draw CTA text offset from the right boundary to make space for the icon
  ctx.fillText('すぐ見返せるようにブックマーク↓', rightX - iconW - 12 * scaleX, footerY);

  // Draw vector bookmark icon
  const iconX = rightX - iconW;
  const iconY = footerY - iconH / 2;
  
  ctx.beginPath();
  ctx.moveTo(iconX, iconY);
  ctx.lineTo(iconX + iconW, iconY);
  ctx.lineTo(iconX + iconW, iconY + iconH);
  ctx.lineTo(iconX + iconW / 2, iconY + iconH * 0.7); // Bookmark bottom notch
  ctx.lineTo(iconX, iconY + iconH);
  ctx.closePath();
  ctx.fillStyle = '#1E314B';
  ctx.fill();
}
