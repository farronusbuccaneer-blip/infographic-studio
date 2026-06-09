/**
 * Configuration and Default Assets for InfoGraphic Generator Studio
 */

const DEFAULT_TEMPLATE_ID = 'default-template';

// Bounding box coordinates based on a 1200x1600 resolution.
// Coordinates here represent the inset area (where text is actually drawn) 
// to prevent text from overlapping borders.
const DEFAULT_COORDS = {
  title: { x: 120, y: 95, w: 720, h: 140 },
  sections: [
    { x: 290, y: 350, w: 700, h: 130 },
    { x: 290, y: 560, w: 700, h: 130 },
    { x: 290, y: 770, w: 700, h: 130 },
    { x: 290, y: 980, w: 700, h: 130 },
    { x: 290, y: 1190, w: 700, h: 130 }
  ]
};

// Default XML template loaded on first startup
const DEFAULT_XML_TEXT = ``;

/**
 * Programmatically generates the high-res default template as a Base64 PNG.
 * This ensures the app is fully functional with no external image asset dependencies.
 */
function generateDefaultTemplate() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1500;
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
  ctx.fillRect(80 + 12, 75 + 12, 800, 180);
  // Main Rect
  ctx.fillStyle = '#F2EFE6';
  ctx.fillRect(80, 75, 800, 180);
  ctx.strokeStyle = navyColor;
  ctx.lineWidth = 12;
  ctx.strokeRect(80, 75, 800, 180);

  // 4. Draw 5 Section Rows
  const boxX = 270;
  const boxW = 850;
  const boxH = 160;
  
  for (let i = 0; i < 5; i++) {
    const boxY = 335 + i * 210;

    // White Text Container Box
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = navyColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Circle for Number
    const circleX = 100;
    const circleY = boxY + 80;
    const circleRadius = 34;
    
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
    ctx.fillStyle = navyColor;
    ctx.fill();

    // Circle Number Text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "bold 36px 'Segoe UI', 'Noto Sans JP', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((i + 1).toString(), circleX, circleY);

    // Checkbox Box
    const checkX = 180;
    const checkY = boxY + 56;
    const checkW = 50;
    const checkH = 47;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(checkX, checkY, checkW, checkH);
    ctx.strokeStyle = navyColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(checkX, checkY, checkW, checkH);

    // Hand-drawn Checkmark
    ctx.beginPath();
    ctx.moveTo(checkX + 11, checkY + 23);
    ctx.lineTo(checkX + 21, checkY + 34);
    ctx.lineTo(checkX + 41, checkY + 11);
    ctx.strokeStyle = navyColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // 5. Draw Bottom Horizontal Accent Line
  ctx.beginPath();
  ctx.moveTo(80, 1425);
  ctx.lineTo(1120, 1425);
  ctx.strokeStyle = navyColor;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/**
 * Standard utility to scale coordinate configs to any image's dimensions.
 * Maps DEFAULT_COORDS proportionally to targetWidth / targetHeight.
 */
function getScaledCoords(targetWidth, targetHeight) {
  const scaleX = targetWidth / 1200;
  const scaleY = targetHeight / 1500;

  return {
    title: {
      x: Math.round(DEFAULT_COORDS.title.x * scaleX),
      y: Math.round(DEFAULT_COORDS.title.y * scaleY),
      w: Math.round(DEFAULT_COORDS.title.w * scaleX),
      h: Math.round(DEFAULT_COORDS.title.h * scaleY)
    },
    sections: DEFAULT_COORDS.sections.map(sec => ({
      x: Math.round(sec.x * scaleX),
      y: Math.round(sec.y * scaleY),
      w: Math.round(sec.w * scaleX),
      h: Math.round(sec.h * scaleY)
    }))
  };
}
