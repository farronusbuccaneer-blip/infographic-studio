/**
 * Configuration and Default Assets for InfoGraphic Generator Studio
 */

const DEFAULT_TEMPLATE_ID = 'default-template';

// Bounding box coordinates based on a 1200x1600 resolution for 5 sections.
const COORDS_5_SECTIONS = {
  title: { x: 120, y: 95, w: 800, h: 140 },
  sections: [
    { x: 290, y: 360, w: 700, h: 140 },
    { x: 290, y: 585, w: 700, h: 140 },
    { x: 290, y: 810, w: 700, h: 140 },
    { x: 290, y: 1035, w: 700, h: 140 },
    { x: 290, y: 1260, w: 700, h: 140 }
  ]
};

// Bounding box coordinates based on a 1200x1600 resolution for 4 sections.
// Increased box height and text area for larger, highly readable typography.
const COORDS_4_SECTIONS = {
  title: { x: 120, y: 95, w: 800, h: 140 },
  sections: [
    { x: 290, y: 360, w: 700, h: 190 },
    { x: 290, y: 640, w: 700, h: 190 },
    { x: 290, y: 920, w: 700, h: 190 },
    { x: 290, y: 1200, w: 700, h: 190 }
  ]
};

const DEFAULT_COORDS = COORDS_5_SECTIONS;

// Default XML template loaded on first startup
const DEFAULT_XML_TEXT = ``;

/**
 * Programmatically generates the high-res default template as a Base64 PNG.
 * Supports sectionCount = 4 (4選) and sectionCount = 5 (5選).
 */
function generateDefaultTemplate(sectionCount = 5) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');

  // 1. Draw Cream Background
  ctx.fillStyle = '#F7F4EB';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Draw Dot Grid Pattern
  ctx.fillStyle = '#E6E1D8';
  const dotSpacing = 30;
  for (let x = 15; x < canvas.width; x += dotSpacing) {
    for (let y = 15; y < canvas.height; y += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const navyColor = '#1E314B';
  const coralColor = '#D3544C';

  // 3. Draw Title Box (Beige container with Red Drop Shadow and thick Navy Border)
  // Drop Shadow
  ctx.fillStyle = coralColor;
  ctx.fillRect(80 + 12, 75 + 12, 880, 180);
  // Main Rect
  ctx.fillStyle = '#F2EFE6';
  ctx.fillRect(80, 75, 880, 180);
  ctx.strokeStyle = navyColor;
  ctx.lineWidth = 12;
  ctx.strokeRect(80, 75, 880, 180);

  // 4. Draw Section Rows (4 or 5)
  const count = sectionCount === 4 ? 4 : 5;
  const boxX = 270;
  const boxW = 850;
  const boxH = count === 4 ? 220 : 170;
  const rowSpacing = count === 4 ? 280 : 225;
  
  for (let i = 0; i < count; i++) {
    const boxY = 345 + i * rowSpacing;

    // White Text Container Box
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = navyColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Circle for Number
    const circleX = 100;
    const circleY = boxY + boxH / 2;
    const circleRadius = count === 4 ? 38 : 34;
    
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
    ctx.fillStyle = navyColor;
    ctx.fill();

    // Circle Number Text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = count === 4 ? "bold 40px 'Segoe UI', 'Noto Sans JP', sans-serif" : "bold 36px 'Segoe UI', 'Noto Sans JP', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((i + 1).toString(), circleX, circleY);

    // Checkbox Box
    const checkW = count === 4 ? 54 : 50;
    const checkH = count === 4 ? 52 : 47;
    const checkX = 180;
    const checkY = boxY + (boxH - checkH) / 2;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(checkX, checkY, checkW, checkH);
    ctx.strokeStyle = navyColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(checkX, checkY, checkW, checkH);

    // Hand-drawn Checkmark
    ctx.beginPath();
    ctx.moveTo(checkX + 11, checkY + Math.round(checkH * 0.48));
    ctx.lineTo(checkX + Math.round(checkW * 0.42), checkY + Math.round(checkH * 0.72));
    ctx.lineTo(checkX + Math.round(checkW * 0.82), checkY + Math.round(checkH * 0.23));
    ctx.strokeStyle = navyColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // 5. Draw Bottom Horizontal Accent Line
  ctx.beginPath();
  ctx.moveTo(80, 1520);
  ctx.lineTo(1120, 1520);
  ctx.strokeStyle = navyColor;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/**
 * Standard utility to scale coordinate configs to any image's dimensions.
 * Maps COORDS (4 or 5 sections) proportionally to targetWidth / targetHeight.
 */
function getScaledCoords(targetWidth, targetHeight, sectionCount = 5) {
  const baseCoords = sectionCount === 4 ? COORDS_4_SECTIONS : COORDS_5_SECTIONS;
  const scaleX = targetWidth / 1200;
  const scaleY = targetHeight / 1600;

  return {
    title: {
      x: Math.round(baseCoords.title.x * scaleX),
      y: Math.round(baseCoords.title.y * scaleY),
      w: Math.round(baseCoords.title.w * scaleX),
      h: Math.round(baseCoords.title.h * scaleY)
    },
    sections: baseCoords.sections.map(sec => ({
      x: Math.round(sec.x * scaleX),
      y: Math.round(sec.y * scaleY),
      w: Math.round(sec.w * scaleX),
      h: Math.round(sec.h * scaleY)
    }))
  };
}
