/**
 * Configuration and Default Assets for InfoGraphic Generator Studio
 */

const DEFAULT_TEMPLATE_ID = 'default-template';

// Bounding box coordinates based on a 1200x1600 resolution.
// Coordinates here represent the inset area (where text is actually drawn) 
// to prevent text from overlapping borders.
const DEFAULT_COORDS = {
  title: { x: 120, y: 110, w: 960, h: 240 },
  sections: [
    { x: 290, y: 480, w: 810, h: 110 },
    { x: 290, y: 690, w: 810, h: 110 },
    { x: 290, y: 900, w: 810, h: 110 },
    { x: 290, y: 1110, w: 810, h: 110 },
    { x: 290, y: 1320, w: 810, h: 110 }
  ]
};

// Default XML template loaded on first startup
const DEFAULT_XML_TEXT = `<title>図解作成の3つのコツ</title>

<section1>
  <row1>1. 情報を<red>極限までシンプル</red>に</row1>
  <row2>文字数は最小限に抑え、伝えたい要点を1文にまとめましょう。</row2>
  <row3>余白を十分に取ることで、読者の視認性と理解度が劇的に向上します。</row3>
</section1>

<section2>
  <row1>2. 配色の黄金比ルールを決める</row1>
  <row2>ベースカラー70%、メインカラー25%、<red>アクセントカラー5%</red>が鉄則。</row2>
  <row3>全体で使う色を<red>3色以内</red>に絞ることで、洗練された印象になります。</row3>
</section2>

<section3>
  <row1>3. <red>アイコンや図形</red>を効果的に使う</row1>
  <row2>文字情報だけでなく、内容を直感的に表す透過PNGを配置します。</row2>
  <row3>読者の目を引きつける視覚的フックになり、SNSでの拡散力がアップ。</row3>
</section3>

<section4>
  <row1>4. 要素を美しく整列する</row1>
  <row2>要素の左揃えや中央揃えを徹底し、ズレを無くします。</row2>
  <row3>デザインが整理されていると、情報の信頼性が高まります。</row3>
</section4>

<section5>
  <row1>5. スマホでの見え方を意識する</row1>
  <row2>ターゲットデバイスでの文字の読みやすさを確認しましょう。</row2>
  <row3><red>少し大きめの文字サイズ</red>を意識することが、成功への近道です。</row3>
</section5>`;

/**
 * Programmatically generates the high-res default template as a Base64 PNG.
 * This ensures the app is fully functional with no external image asset dependencies.
 */
function generateDefaultTemplate() {
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
  ctx.fillRect(80 + 12, 80 + 12, 1040, 300);
  // Main Rect
  ctx.fillStyle = '#F2EFE6';
  ctx.fillRect(80, 80, 1040, 300);
  ctx.strokeStyle = navyColor;
  ctx.lineWidth = 12;
  ctx.strokeRect(80, 80, 1040, 300);

  // 4. Draw 5 Section Rows
  const boxX = 270;
  const boxW = 850;
  const boxH = 150;
  
  for (let i = 0; i < 5; i++) {
    const boxY = 460 + i * 210;

    // White Text Container Box
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = navyColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Circle for Number
    const circleX = 100;
    const circleY = boxY + 75;
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
    const checkY = boxY + 50;
    const checkW = 50;
    const checkH = 50;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(checkX, checkY, checkW, checkH);
    ctx.strokeStyle = navyColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(checkX, checkY, checkW, checkH);

    // Hand-drawn Checkmark
    ctx.beginPath();
    ctx.moveTo(checkX + 11, checkY + 25);
    ctx.lineTo(checkX + 21, checkY + 36);
    ctx.lineTo(checkX + 41, checkY + 12);
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
 * Maps DEFAULT_COORDS proportionally to targetWidth / targetHeight.
 */
function getScaledCoords(targetWidth, targetHeight) {
  const scaleX = targetWidth / 1200;
  const scaleY = targetHeight / 1600;

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
