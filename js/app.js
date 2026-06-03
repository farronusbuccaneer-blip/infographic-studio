/**
 * InfoGraphic Generator Studio - Main Orchestrator
 */

// Application State
let canvas;
let activeTemplate = null;
let activeCoords = null;
let zoomRatio = 1.0;
let isEditCoordsMode = false;
let originalWidth = 1200;
let originalHeight = 1600;
let textRenderDebounceTimer = null;

// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const workspaceEl = document.getElementById('workspace');
const xmlInput = document.getElementById('xml-input');
const templatesGrid = document.getElementById('templates-grid');
const overlaysGrid = document.getElementById('overlays-grid');
const toastContainer = document.getElementById('toast-container');
const configEditorBar = document.getElementById('config-editor-bar');

// Buttons
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const btnToggleTheme = document.getElementById('btn-toggle-theme');
const btnToggleEditMode = document.getElementById('btn-toggle-edit-mode');
const btnClearCanvas = document.getElementById('btn-clear-canvas');
const btnDownload = document.getElementById('btn-download');
const btnResetText = document.getElementById('btn-reset-text');
const btnClearText = document.getElementById('btn-clear-text');
const btnSaveCoords = document.getElementById('btn-save-coords');
const btnCancelCoords = document.getElementById('btn-cancel-coords');

// File Upload inputs
const inputUploadTemplate = document.getElementById('input-upload-template');
const inputUploadOverlay = document.getElementById('input-upload-overlay');
const uploadTemplateZone = document.getElementById('upload-template-zone');
const uploadOverlayZone = document.getElementById('upload-overlay-zone');

/**
 * Toast Notifications helper
 */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-check';
  if (type === 'danger') icon = 'fa-triangle-exclamation';
  if (type === 'warning') icon = 'fa-circle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
  toastContainer.appendChild(toast);

  // Remove toast after animation finishes
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 2500);
}

/**
 * Initialize Default Assets in IndexedDB on first load
 */
async function initializeDefaultAssets() {
  // 1. Templates
  const templateCount = await db.templates.count();
  if (templateCount === 0) {
    const defaultDataUrl = generateDefaultTemplate();
    const defaultTemplate = {
      id: DEFAULT_TEMPLATE_ID,
      name: '標準チェックリスト',
      data_url: defaultDataUrl,
      created_at: Date.now()
    };
    await db.templates.add(defaultTemplate);
    
    // Save default configuration
    await db.configs.add({
      template_id: DEFAULT_TEMPLATE_ID,
      title: DEFAULT_COORDS.title,
      sections: DEFAULT_COORDS.sections
    });
  }

  // 2. Stamps/Overlays
  const overlayCount = await db.overlays.count();
  if (overlayCount === 0) {
    const overlays = [
      { name: 'チェック緑', draw: (ctx) => {
        ctx.fillStyle = '#10B981';
        ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(35, 65); ctx.lineTo(55, 85); ctx.lineTo(90, 45); ctx.stroke();
      }},
      { name: 'チェック赤', draw: (ctx) => {
        ctx.fillStyle = '#EF4444';
        ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(35, 65); ctx.lineTo(55, 85); ctx.lineTo(90, 45); ctx.stroke();
      }},
      { name: '警告マーク', draw: (ctx) => {
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = "bold 70px sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 64, 64);
      }},
      { name: 'はてな', draw: (ctx) => {
        ctx.fillStyle = '#3B82F6';
        ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = "bold 65px sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 64, 64);
      }},
      { name: 'ゴールドスター', draw: (ctx) => {
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * 55 + 64, -Math.sin((18 + i * 72) * Math.PI / 180) * 55 + 64);
          ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * 22 + 64, -Math.sin((54 + i * 72) * Math.PI / 180) * 22 + 64);
        }
        ctx.closePath(); ctx.fill();
      }},
      { name: '矢印右', draw: (ctx) => {
        ctx.fillStyle = '#6366F1';
        ctx.beginPath();
        ctx.moveTo(15, 45); ctx.lineTo(75, 45); ctx.lineTo(75, 25); ctx.lineTo(110, 64);
        ctx.lineTo(75, 103); ctx.lineTo(75, 83); ctx.lineTo(15, 83); ctx.closePath(); ctx.fill();
      }}
    ];

    for (const item of overlays) {
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      item.draw(cv.getContext('2d'));
      await db.overlays.add({
        id: crypto.randomUUID(),
        name: item.name,
        data_url: cv.toDataURL('image/png'),
        created_at: Date.now()
      });
    }
  }
}

/**
 * Initialize Fabric Interactive Canvas
 */
function initFabricCanvas() {
  canvas = new fabric.Canvas('canvas', {
    selection: true,
    preserveObjectStacking: true
  });

  // Attach delete key listeners
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
        return;
      }
      const active = canvas.getActiveObject();
      // Don't delete bounding boxes in Edit Coordinate mode
      if (active && active.name !== 'title' && !active.name?.startsWith('section')) {
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.renderAll();
        showToast('スタンプを削除しました');
      }
    }
  });

  // Track active stamps and update instructions
  canvas.on('selection:created', updateHintText);
  canvas.on('selection:cleared', updateHintText);
}

function updateHintText() {
  const active = canvas.getActiveObject();
  const hintText = document.getElementById('hint-text');
  if (active) {
    if (active.name === 'title' || active.name?.startsWith('section')) {
      hintText.innerHTML = `<i class="fa-solid fa-arrows-up-down-left-right"></i> テキストボックスの角をドラッグしてサイズ調整、移動できます。`;
    } else {
      hintText.innerHTML = `<i class="fa-solid fa-arrows-spin"></i> [Delete]でスタンプ削除。角でサイズ/回転を調整できます。`;
    }
  } else {
    hintText.innerHTML = `<i class="fa-solid fa-circle-question"></i> 画像を選択してキャンバスに追加。ドラッグで移動、角ハンドルで縮尺/回転、[Delete]キーで削除。`;
  }
}

/**
 * Core Dynamic Render: Draws background + XML text to base high-res canvas
 * and sets it as the Fabric Background.
 */
function renderCanvasBackground() {
  if (!activeTemplate) return;

  const parsed = parseXMLText(xmlInput.value);
  const hiddenCanvas = document.getElementById('hidden-base-canvas');
  hiddenCanvas.width = originalWidth;
  hiddenCanvas.height = originalHeight;
  const ctx = hiddenCanvas.getContext('2d');

  const img = new Image();
  img.onload = function() {
    // 1. Draw template background
    ctx.drawImage(img, 0, 0, originalWidth, originalHeight);

    // 2. Render fit-to-box texts
    renderTextOnCanvas(ctx, parsed, activeCoords);

    // 3. Update interactive Fabric canvas background
    const dataUrl = hiddenCanvas.toDataURL('image/png');
    fabric.Image.fromURL(dataUrl, (fabricImg) => {
      canvas.setBackgroundImage(fabricImg, canvas.renderAll.bind(canvas), {
        originX: 'left',
        originY: 'top',
        width: originalWidth,
        height: originalHeight
      });
    });
  };
  img.src = activeTemplate.data_url;
}

/**
 * Debounced trigger for text inputs
 */
function triggerRenderDebounced() {
  if (isEditCoordsMode) return; // Freeze dynamic background rendering in layout edit mode
  clearTimeout(textRenderDebounceTimer);
  textRenderDebounceTimer = setTimeout(renderCanvasBackground, 40);
}

/**
 * Zoom and Pan handlers
 */
function applyZoom() {
  canvas.setDimensions({
    width: originalWidth * zoomRatio,
    height: originalHeight * zoomRatio
  });
  canvas.setZoom(zoomRatio);
  document.getElementById('zoom-label').innerText = `${Math.round(zoomRatio * 100)}%`;
}

function fitCanvasToWorkspace() {
  const padding = 80;
  const workW = workspaceEl.clientWidth - padding;
  const workH = workspaceEl.clientHeight - padding;
  
  const zoomX = workW / originalWidth;
  const zoomY = workH / originalHeight;
  zoomRatio = Math.min(zoomX, zoomY, 1.1); // Max zoom fit is 110%
  applyZoom();
}

/**
 * Load Template list and UI grid
 */
async function loadTemplatesGrid() {
  templatesGrid.innerHTML = '';
  const list = await db.templates.orderBy('created_at').reverse().toArray();
  
  list.forEach(t => {
    const card = document.createElement('div');
    card.className = `asset-card ${activeTemplate && activeTemplate.id === t.id ? 'active' : ''}`;
    
    // Thumbnail image
    const img = document.createElement('img');
    img.src = t.data_url;
    card.appendChild(img);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'asset-actions';

    // Delete Button (Except default standard template)
    if (t.id !== DEFAULT_TEMPLATE_ID) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete-asset';
      delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
      delBtn.title = 'テンプレートを削除';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm('この背景テンプレートを削除しますか？')) {
          await db.templates.delete(t.id);
          await db.configs.delete(t.id);
          showToast('テンプレートを削除しました', 'danger');
          if (activeTemplate && activeTemplate.id === t.id) {
            await selectTemplate(DEFAULT_TEMPLATE_ID);
          } else {
            loadTemplatesGrid();
          }
        }
      };
      actions.appendChild(delBtn);
    }
    card.appendChild(actions);

    // Click to Select
    card.onclick = () => selectTemplate(t.id);

    templatesGrid.appendChild(card);
  });
}

/**
 * Select Template and load its custom configurations
 */
async function selectTemplate(id) {
  const t = await db.templates.get(id);
  if (!t) return;

  activeTemplate = t;
  
  // Read image dimensions
  const img = new Image();
  img.onload = async () => {
    originalWidth = img.width;
    originalHeight = img.height;

    // Load template bounding boxes configuration
    let config = await db.configs.get(id);
    if (!config) {
      // Auto scale default bounds based on template dimensions
      activeCoords = getScaledCoords(originalWidth, originalHeight);
      // Save scaled coordinates as current template config
      await db.configs.put({
        template_id: id,
        title: activeCoords.title,
        sections: activeCoords.sections
      });
    } else {
      activeCoords = {
        title: config.title,
        sections: config.sections
      };
    }

    // Set background and zoom
    fitCanvasToWorkspace();
    renderCanvasBackground();
    loadTemplatesGrid();
    showToast(`背景を「${t.name}」に変更しました`);
  };
  img.src = t.data_url;
}

/**
 * Load Overlay stamps grid
 */
async function loadOverlaysGrid() {
  overlaysGrid.innerHTML = '';
  const list = await db.overlays.orderBy('created_at').reverse().toArray();

  list.forEach(o => {
    const card = document.createElement('div');
    card.className = 'asset-card overlay-card';

    const img = document.createElement('img');
    img.src = o.data_url;
    card.appendChild(img);

    const actions = document.createElement('div');
    actions.className = 'asset-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-asset';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm('この透過スタンプを削除しますか？')) {
        await db.overlays.delete(o.id);
        showToast('スタンプを削除しました', 'danger');
        loadOverlaysGrid();
      }
    };
    actions.appendChild(delBtn);
    card.appendChild(actions);

    // Click to add to Fabric Canvas
    card.onclick = () => addOverlayToCanvas(o.data_url);

    overlaysGrid.appendChild(card);
  });
}

/**
 * Add Stamp Overlay Image to Canvas
 */
function addOverlayToCanvas(dataUrl) {
  if (isEditCoordsMode) {
    showToast('レイアウト編集モード中はスタンプを追加できません。', 'warning');
    return;
  }
  fabric.Image.fromURL(dataUrl, (img) => {
    const scale = (originalWidth * 0.12) / img.width; // Fits nicely (12% of template width)
    img.set({
      left: originalWidth / 2,
      top: originalHeight / 2,
      scaleX: scale,
      scaleY: scale,
      originX: 'center',
      originY: 'center',
      cornerColor: '#6366F1',
      cornerSize: 12,
      transparentCorners: false,
      borderColor: '#6366F1'
    });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.renderAll();
    showToast('スタンプを追加しました');
  });
}

/**
 * Layout Coordinate Edit Mode (Studio Mode)
 */
function enterEditCoordsMode() {
  if (isEditCoordsMode) return;
  isEditCoordsMode = true;

  btnToggleEditMode.classList.add('btn-active');
  configEditorBar.style.display = 'flex';

  // 1. Disable selectability of overlay stamps on canvas
  canvas.getObjects().forEach(obj => {
    obj.selectable = false;
    obj.evented = false;
  });

  // 2. Draw helper resizable boxes for title & sections
  const fontColor = '#1E314B';

  // Title Box Helper
  const titleBox = activeCoords.title;
  const titleRect = new fabric.Rect({
    left: titleBox.x,
    top: titleBox.y,
    width: titleBox.w,
    height: titleBox.h,
    fill: 'rgba(99, 102, 241, 0.25)',
    stroke: '#6366F1',
    strokeWidth: 4,
    name: 'title',
    hasRotatingPoint: false,
    cornerColor: '#6366F1',
    cornerSize: 12,
    transparentCorners: false
  });
  canvas.add(titleRect);

  // Section Boxes Helpers
  activeCoords.sections.forEach((sec, idx) => {
    const secRect = new fabric.Rect({
      left: sec.x,
      top: sec.y,
      width: sec.w,
      height: sec.h,
      fill: 'rgba(16, 185, 129, 0.2)',
      stroke: '#10B981',
      strokeWidth: 3,
      name: `section-${idx}`,
      hasRotatingPoint: false,
      cornerColor: '#10B981',
      cornerSize: 10,
      transparentCorners: false
    });
    canvas.add(secRect);
  });

  canvas.discardActiveObject();
  canvas.renderAll();
  showToast('レイアウト編集モードに入りました。テキスト枠を調整してください。', 'warning');
}

function exitEditCoordsMode(saveChanges = true) {
  if (!isEditCoordsMode) return;
  isEditCoordsMode = false;

  btnToggleEditMode.classList.remove('btn-active');
  configEditorBar.style.display = 'none';

  // 1. Retrieve new coordinates if requested
  if (saveChanges) {
    const titleRect = canvas.getObjects().find(o => o.name === 'title');
    const sectionRects = Array.from({ length: 5 }, (_, i) => 
      canvas.getObjects().find(o => o.name === `section-${i}`)
    );

    if (titleRect) {
      activeCoords.title = {
        x: Math.round(titleRect.left),
        y: Math.round(titleRect.top),
        w: Math.round(titleRect.width * titleRect.scaleX),
        h: Math.round(titleRect.height * titleRect.scaleY)
      };
    }

    sectionRects.forEach((rect, idx) => {
      if (rect) {
        activeCoords.sections[idx] = {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          w: Math.round(rect.width * rect.scaleX),
          h: Math.round(rect.height * rect.scaleY)
        };
      }
    });

    // Save config back to DB
    db.configs.put({
      template_id: activeTemplate.id,
      title: activeCoords.title,
      sections: activeCoords.sections
    }).then(() => {
      showToast('テキストレイアウトを保存しました');
    });
  }

  // 2. Remove all editor helper boxes
  const helpers = canvas.getObjects().filter(o => 
    o.name === 'title' || o.name?.startsWith('section-')
  );
  helpers.forEach(h => canvas.remove(h));

  // 3. Restore stamps selectability
  canvas.getObjects().forEach(obj => {
    obj.selectable = true;
    obj.evented = true;
  });

  canvas.discardActiveObject();
  renderCanvasBackground();
  showToast('レイアウト編集モードを終了しました');
}

/**
 * High-Resolution PNG Export (dual-canvas conversion)
 */
function downloadGraphic() {
  if (isEditCoordsMode) {
    showToast('レイアウト調整中はダウンロードできません。一度保存してください。', 'warning');
    return;
  }
  
  showToast('画像を出力中...', 'warning');

  // Grab the hidden base canvas containing template and text drawn at high-res
  const hiddenCanvas = document.getElementById('hidden-base-canvas');
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = originalWidth;
  exportCanvas.height = originalHeight;
  const ctx = exportCanvas.getContext('2d');

  // Draw background image and text layer first
  ctx.drawImage(hiddenCanvas, 0, 0);

  // Parse Fabric overlays and overlay them onto high-res export context
  const overlays = canvas.getObjects();
  
  overlays.forEach(overlay => {
    if (overlay.name === 'title' || overlay.name?.startsWith('section')) return;
    if (!overlay._element) return;

    ctx.save();
    
    const center = overlay.getCenterPoint();
    ctx.translate(center.x, center.y);
    ctx.rotate((overlay.angle || 0) * Math.PI / 180);

    const flipX = overlay.flipX ? -1 : 1;
    const flipY = overlay.flipY ? -1 : 1;
    ctx.scale(flipX, flipY);

    const w = overlay.width * overlay.scaleX * flipX;
    const h = overlay.height * overlay.scaleY * flipY;

    ctx.globalAlpha = overlay.opacity ?? 1;
    ctx.drawImage(overlay._element, -Math.abs(w) / 2, -Math.abs(h) / 2, Math.abs(w), Math.abs(h));
    
    ctx.restore();
  });

  const dataUrl = exportCanvas.toDataURL('image/png');

  if (window.innerWidth <= 768) {
    // Mobile/Tablet download popup modal (requires long press to save)
    const modal = document.getElementById('mobile-download-modal');
    const modalImg = document.getElementById('mobile-download-img');
    modalImg.src = dataUrl;
    modal.style.display = 'flex';
    showToast('画像を生成しました。長押しして保存してください。', 'warning');
  } else {
    // Desktop download logic via dynamic link click
    const link = document.createElement('a');
    link.download = `infographic_${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('図解画像のダウンロードが完了しました！');
  }
}

/**
 * Templates Tab Switching and Sidebar Navigation
 */
function initTabNavigation() {
  const tabTemplates = document.getElementById('tab-templates');
  const tabOverlays = document.getElementById('tab-overlays');
  const paneTemplates = document.getElementById('pane-templates');
  const paneOverlays = document.getElementById('pane-overlays');

  tabTemplates.onclick = () => {
    tabTemplates.classList.add('active');
    tabOverlays.classList.remove('active');
    paneTemplates.classList.add('active');
    paneOverlays.classList.remove('active');
  };

  tabOverlays.onclick = () => {
    tabOverlays.classList.add('active');
    tabTemplates.classList.remove('active');
    paneOverlays.classList.add('active');
    paneTemplates.classList.remove('active');
  };
}

/**
 * Handle Theme Light/Dark styling preferences
 */
function initThemePreference() {
  const currentTheme = localStorage.getItem('theme') || 'dark';
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
    btnToggleTheme.innerHTML = '<i class="fa-solid fa-sun"></i>';
  } else {
    document.body.classList.remove('light-theme');
    btnToggleTheme.innerHTML = '<i class="fa-solid fa-moon"></i>';
  }

  btnToggleTheme.onclick = () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    btnToggleTheme.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    showToast(`${isLight ? 'ライト' : 'ダーク'}モードに切り替えました`);
  };
}

/**
 * Drag and Drop & Upload Files Listeners
 */
function initFileUploads() {
  // 1. Template Backgrounds Upload
  const handleTemplateFile = (file) => {
    if (!file) return;
    if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
      showToast('背景にはJPGまたはPNG画像をアップロードしてください。', 'danger');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = async () => {
        const id = crypto.randomUUID();
        await db.templates.add({
          id: id,
          name: file.name.split('.')[0],
          data_url: dataUrl,
          created_at: Date.now()
        });
        showToast('新しい背景テンプレートを保存しました！');
        selectTemplate(id);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  inputUploadTemplate.onchange = (e) => handleTemplateFile(e.target.files[0]);

  setupDragAndDrop(uploadTemplateZone, handleTemplateFile);

  // 2. Translucent overlays Upload
  const handleOverlayFile = (file) => {
    if (!file) return;
    if (!file.type.match('image/png')) {
      showToast('透過スタンプにはPNG画像をアップロードしてください。', 'danger');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      await db.overlays.add({
        id: crypto.randomUUID(),
        name: file.name.split('.')[0],
        data_url: e.target.result,
        created_at: Date.now()
      });
      showToast('透過スタンプを追加保存しました！');
      loadOverlaysGrid();
    };
    reader.readAsDataURL(file);
  };

  inputUploadOverlay.onchange = (e) => handleOverlayFile(e.target.files[0]);

  setupDragAndDrop(uploadOverlayZone, handleOverlayFile);
}

function setupDragAndDrop(zone, fileHandler) {
  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--accent-color)';
      zone.style.background = 'var(--accent-light)';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--border-color)';
      zone.style.background = 'transparent';
    }, false);
  });

  zone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    fileHandler(files[0]);
  }, false);
}

/**
 * Text Editor Shortcuts (insert XML tags)
 */
function initXmlEditorShortcuts() {
  // Tag insert listeners
  document.querySelectorAll('.xml-shortcuts .shortcut-btn[data-tag]').forEach(btn => {
    btn.onclick = () => {
      const tag = btn.getAttribute('data-tag');
      const startTag = tag === 'section' ? '<section1>\n  <row1>' : `<${tag}>`;
      const endTag = tag === 'section' ? '</row1>\n</section1>' : `</${tag}>`;
      
      const start = xmlInput.selectionStart;
      const end = xmlInput.selectionEnd;
      const text = xmlInput.value;
      
      xmlInput.value = text.substring(0, start) + startTag + text.substring(start, end) + endTag + text.substring(end);
      
      // Put cursor back inside tags
      xmlInput.focus();
      const newCursorPos = start + startTag.length;
      xmlInput.setSelectionRange(newCursorPos, newCursorPos + (end - start));
      
      triggerRenderDebounced();
    };
  });

  // Clear Editor
  btnClearText.onclick = () => {
    if (confirm('エディタのテキストを全て消去しますか？')) {
      xmlInput.value = '';
      triggerRenderDebounced();
      showToast('エディタをクリアしました', 'warning');
    }
  };

  // Reset text template to default
  btnResetText.onclick = () => {
    if (confirm('テキストをデフォルトのサンプル文面に戻しますか？')) {
      xmlInput.value = DEFAULT_XML_TEXT;
      triggerRenderDebounced();
      showToast('テキストをリセットしました');
    }
  };
}

/**
 * Initialize Web Fonts and wait for Noto Sans JP
 */
function initWebFonts(callback) {
  // Append google fonts if not loaded
  if (!document.querySelector('link[href*="fonts.googleapis.com"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap';
    document.head.appendChild(link);
  }

  // Monitor Font loading
  document.fonts.ready.then(() => {
    callback();
  }).catch(() => {
    // Fallback if network blocked
    callback();
  });
}

/**
 * Wire UI Controls Listeners
 */
function bindUIControls() {
  // Zooming
  btnZoomIn.onclick = () => {
    zoomRatio = Math.min(zoomRatio + 0.1, 3.0);
    applyZoom();
  };
  btnZoomOut.onclick = () => {
    zoomRatio = Math.max(zoomRatio - 0.1, 0.2);
    applyZoom();
  };
  btnZoomFit.onclick = fitCanvasToWorkspace;

  // Edit Coordinates Mode Toggle
  btnToggleEditMode.onclick = () => {
    if (isEditCoordsMode) {
      exitEditCoordsMode(true);
    } else {
      enterEditCoordsMode();
    }
  };

  btnSaveCoords.onclick = () => exitEditCoordsMode(true);
  btnCancelCoords.onclick = () => exitEditCoordsMode(false);

  // Clear overlay icons
  btnClearCanvas.onclick = () => {
    if (confirm('キャンバス上に配置したすべての透過スタンプを削除しますか？')) {
      const stamps = canvas.getObjects().filter(o => 
        o.name !== 'title' && !o.name?.startsWith('section')
      );
      stamps.forEach(s => canvas.remove(s));
      canvas.discardActiveObject();
      canvas.renderAll();
      showToast('透過スタンプを全削除しました', 'danger');
    }
  };

  // Export Graphic
  btnDownload.onclick = downloadGraphic;

  // Mobile download modal close
  const btnCloseDownloadModal = document.getElementById('btn-close-download-modal');
  if (btnCloseDownloadModal) {
    btnCloseDownloadModal.onclick = () => {
      document.getElementById('mobile-download-modal').style.display = 'none';
    };
  }

  // Debounced input listeners on editor textarea
  xmlInput.oninput = triggerRenderDebounced;

  // Window Resize
  window.onresize = fitCanvasToWorkspace;

  // Mobile Drawer toggles (for tablet size 769px - 1024px)
  const btnToggleEditor = document.getElementById('btn-toggle-editor');
  const btnToggleAssets = document.getElementById('btn-toggle-assets');
  const leftSidebar = document.querySelector('.editor-sidebar');
  const rightSidebar = document.querySelector('.assets-sidebar');

  if (btnToggleEditor) {
    btnToggleEditor.onclick = (e) => {
      e.stopPropagation();
      leftSidebar.classList.toggle('sidebar-open');
      rightSidebar.classList.remove('sidebar-open');
    };
  }

  if (btnToggleAssets) {
    btnToggleAssets.onclick = (e) => {
      e.stopPropagation();
      rightSidebar.classList.toggle('sidebar-open');
      leftSidebar.classList.remove('sidebar-open');
    };
  }

  // Close drawers when clicking on the workspace (on tablet drawer views)
  workspaceEl.addEventListener('click', () => {
    if (window.innerWidth > 768 && window.innerWidth <= 1024) {
      leftSidebar.classList.remove('sidebar-open');
      rightSidebar.classList.remove('sidebar-open');
    }
  });
}

/**
 * Mobile Navigation controller for split screen views (under 768px)
 */
function initMobileNavigation() {
  const mbtnText = document.getElementById('mbtn-text');
  const mbtnTemplates = document.getElementById('mbtn-templates');
  const mbtnOverlays = document.getElementById('mbtn-overlays');
  const mbtnAdjust = document.getElementById('mbtn-adjust');

  const leftSidebar = document.querySelector('.editor-sidebar');
  const rightSidebar = document.querySelector('.assets-sidebar');

  const tabTemplates = document.getElementById('tab-templates');
  const tabOverlays = document.getElementById('tab-overlays');

  function clearMobileActive() {
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
    leftSidebar.classList.remove('active-mobile');
    rightSidebar.classList.remove('active-mobile');
  }

  mbtnText.onclick = (e) => {
    e.stopPropagation();
    clearMobileActive();
    mbtnText.classList.add('active');
    leftSidebar.classList.add('active-mobile');
  };

  mbtnTemplates.onclick = (e) => {
    e.stopPropagation();
    clearMobileActive();
    mbtnTemplates.classList.add('active');
    rightSidebar.classList.add('active-mobile');
    
    // Programmatically trigger templates tab inside assets pane
    tabTemplates.click();
  };

  mbtnOverlays.onclick = (e) => {
    e.stopPropagation();
    clearMobileActive();
    mbtnOverlays.classList.add('active');
    rightSidebar.classList.add('active-mobile');
    
    // Programmatically trigger overlays tab inside assets pane
    tabOverlays.click();
  };

  mbtnAdjust.onclick = (e) => {
    e.stopPropagation();
    clearMobileActive();
    mbtnAdjust.classList.add('active');
    
    // Trigger edit coordinate bounds
    if (!isEditCoordsMode) {
      enterEditCoordsMode();
    }
  };

  // If exiting layout adjustments from top bar, reset bottom nav state to text tab
  btnSaveCoords.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      mbtnText.click();
    }
  });
  btnCancelCoords.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      mbtnText.click();
    }
  });

  // Set default active view on mobile on load (safely triggered after all click handlers are bound)
  if (window.innerWidth <= 768) {
    mbtnText.click();
  }
}

/**
 * Main Application Bootstrap
 */
window.onload = async () => {
  try {
    // 1. Setup IndexedDB default values
    await initializeDefaultAssets();

    // 2. Prepare Web Fonts
    initWebFonts(() => {
      // 3. Initialize Fabric.js
      initFabricCanvas();

      // 4. Bind listeners
      bindUIControls();
      initTabNavigation();
      initThemePreference();
      initFileUploads();
      initXmlEditorShortcuts();
      initMobileNavigation();

      // 5. Load default starter data
      xmlInput.value = DEFAULT_XML_TEXT;

      // 6. Select initial default template
      selectTemplate(DEFAULT_TEMPLATE_ID).then(() => {
        // Load libraries grids in sidebars
        loadTemplatesGrid();
        loadOverlaysGrid();

        // 7. Hide loading overlay
        setTimeout(() => {
          loadingScreen.style.opacity = '0';
          setTimeout(() => {
            loadingScreen.style.display = 'none';
          }, 300);
        }, 400);
      });
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    loadingScreen.innerHTML = `<div class="loading-text" style="color: var(--danger-color);"><i class="fa-solid fa-triangle-exclamation"></i> 起動エラーが発生しました: ${err.message}</div>`;
  }
};
