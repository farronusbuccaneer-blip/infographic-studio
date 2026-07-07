/**
 * InfoGraphic Generator Studio - Main Orchestrator
 */

// Application State
let canvas;
let activeTemplate = null;
let activeCoords = null;
let zoomRatio = 1.0;
let originalWidth = 1200;
let originalHeight = 1600;
let textRenderDebounceTimer = null;

// Section Images State
let activeSectionImages = Array.from({ length: 5 }, () => null);
let activeTitleImage = null;
let selectingSectionIndex = null;

// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const workspaceEl = document.getElementById('workspace');
const xmlInput = document.getElementById('xml-input');
const templatesGrid = document.getElementById('templates-grid');
const overlaysGrid = document.getElementById('overlays-grid');
const toastContainer = document.getElementById('toast-container');

// Buttons
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const btnToggleTheme = document.getElementById('btn-toggle-theme');
const btnClearCanvas = document.getElementById('btn-clear-canvas');
const btnDownload = document.getElementById('btn-download');
const btnResetText = document.getElementById('btn-reset-text');
const btnClearText = document.getElementById('btn-clear-text');

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
  // 1. Templates (Always put/overwrite the system default standard template to keep it updated with the 3:4 aspect ratio)
  const defaultDataUrl = generateDefaultTemplate();
  const defaultTemplate = {
    id: DEFAULT_TEMPLATE_ID,
    name: '標準チェックリスト',
    data_url: defaultDataUrl,
    created_at: Date.now()
  };
  await db.templates.put(defaultTemplate);
  
  // Save/Overwrite default coordinates configuration
  await db.configs.put({
    template_id: DEFAULT_TEMPLATE_ID,
    title: DEFAULT_COORDS.title,
    sections: DEFAULT_COORDS.sections
  });

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
      // Don't delete bounding boxes, but allow deleting section/title images
      if (active && ((active.name !== 'title' && !active.name?.startsWith('section')) || active.isSectionImage || active.isTitleImage)) {
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.renderAll();
        showToast(active.isSectionImage ? 'セクション画像を削除しました' : (active.isTitleImage ? 'タイトル画像を削除しました' : 'スタンプを削除しました'));
      }
    }
  });

  // Auto-save coordinate changes when section or title images are modified
  canvas.on('object:modified', (e) => {
    if (e.target) {
      if (e.target.isSectionImage) {
        saveSectionImagesToDb();
      } else if (e.target.isTitleImage) {
        saveTitleImageToDb();
      }
    }
  });

  // Auto-update UI and save state when section or title images are removed
  canvas.on('object:removed', (e) => {
    if (e.target) {
      if (e.target.isSectionImage) {
        const idx = e.target.sectionIndex;
        activeSectionImages[idx] = null;
        updateSectionImageUI(idx, null);
        saveSectionImagesToDb();
      } else if (e.target.isTitleImage) {
        activeTitleImage = null;
        updateTitleImageUI(null);
        saveTitleImageToDb();
        triggerRenderDebounced(); // Redraw text to fill back wide layout
      }
    }
  });
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
  clearTimeout(textRenderDebounceTimer);
  textRenderDebounceTimer = setTimeout(renderCanvasBackground, 40);
}

/**
 * Zoom and Pan handlers
 */
function applyZoom() {
  const scaledW = originalWidth * zoomRatio;
  const scaledH = originalHeight * zoomRatio;

  canvas.setDimensions({
    width: scaledW,
    height: scaledH
  });
  canvas.setZoom(zoomRatio);

  // Sync outer container size to avoid flex stretching or clipping layout bugs
  const outerContainer = document.querySelector('.canvas-container-outer');
  if (outerContainer) {
    outerContainer.style.width = `${scaledW}px`;
    outerContainer.style.height = `${scaledH}px`;
  }

  document.getElementById('zoom-label').innerText = `${Math.round(zoomRatio * 100)}%`;
}

function fitCanvasToWorkspace() {
  const padding = window.innerWidth <= 768 ? 24 : 80;
  
  if (window.innerWidth <= 768) {
    // Width-based zoom ratio using viewport physical width
    // Subtract safe side paddings (24px total)
    const screenW = window.innerWidth - padding;
    const zoomX = screenW / originalWidth;
    
    // Height-based zoom ratio (limit viewport height based on window.innerHeight)
    // Subtract header height (56px) and safe vertical padding (32px)
    const maxVisibleH = window.innerHeight - 56 - 32;
    const zoomY = maxVisibleH / originalHeight;
    
    // Fit canvas cleanly within both width and height boundaries
    zoomRatio = Math.min(zoomX, zoomY, 1.1);
  } else {
    const workW = workspaceEl.clientWidth - padding;
    const workH = workspaceEl.clientHeight - padding;
    const zoomX = workW / originalWidth;
    const zoomY = workH / originalHeight;
    zoomRatio = Math.min(zoomX, zoomY, 1.1); // Max zoom fit is 110%
  }
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
    await loadTitleImageFromDb();
    await loadSectionImagesFromDb();
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
 * High-Resolution PNG Export (dual-canvas conversion)
 */
function downloadGraphic() {
  showToast('画像を出力中...', 'warning');

  try {
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
      if ((overlay.name === 'title' && !overlay.isTitleImage) || (overlay.name?.startsWith('section') && !overlay.isSectionImage)) return;
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

    // Generate clean filename based on <title> tag text
    const parsedText = parseXMLText(xmlInput.value);
    let cleanTitle = (parsedText.title || '')
      .replace(/<[^>]*>/g, '')         // Remove HTML/XML tags like <red> or <emp>
      .replace(/[\r\n]+/g, ' ')        // Remove newlines
      .replace(/[\\/:*?"<>|]/g, '')    // Remove invalid filename characters
      .replace(/\s+/g, '_')            // Replace spaces with underscores
      .trim();
    const filename = cleanTitle ? `${cleanTitle}.png` : `infographic_${Date.now()}.png`;

    if (window.innerWidth <= 768) {
      // Mobile/Tablet download popup modal (requires long press to save)
      const modal = document.getElementById('mobile-download-modal');
      const modalImg = document.getElementById('mobile-download-img');
      modalImg.src = dataUrl;
      modal.style.display = 'flex';
      showToast('画像を生成しました。長押しして保存してください。', 'warning');

      // Attempt direct download parallelly (some mobile browsers support it)
      try {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (directDlErr) {
        console.warn('Direct download attempt failed on mobile:', directDlErr);
      }
    } else {
      // Desktop download logic via dynamic link click
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('図解画像のダウンロードが完了しました！');
    }
  } catch (err) {
    console.error('Download graphic processing failed:', err);
    alert('画像の保存に失敗しました:\n' + err.message);
    showToast('エラーが発生しました: ' + err.message, 'danger');
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



  // Set default active view on mobile on load (safely triggered after all click handlers are bound)
  if (window.innerWidth <= 768) {
    mbtnText.click();
  }
}

/**
 * Initialize Collapsible accordion sections for mobile view (under 768px)
 */
function initCollapsibleSections() {
  const leftSidebar = document.querySelector('.editor-sidebar');
  const paneTemplates = document.getElementById('pane-templates');
  const paneOverlays = document.getElementById('pane-overlays');

  // Accordion toggle helper for left sidebar (PC & Mobile unified)
  const toggleAccordion = (header, container) => {
    container.classList.toggle('collapsed');
    const isCollapsed = container.classList.contains('collapsed');
    const chevron = header.querySelector('.toggle-chevron');
    if (chevron) {
      chevron.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    // Re-fit canvas dynamically based on viewport height updates after collapse toggle
    if (window.innerWidth <= 768) {
      fitCanvasToWorkspace();
    }
  };

  // 1. Text Editor Accordion
  const textEditorHeader = leftSidebar.querySelector('.text-editor-header');
  const textEditorContainer = leftSidebar.querySelector('.text-editor-container');
  if (textEditorHeader && textEditorContainer) {
    textEditorHeader.onclick = () => toggleAccordion(textEditorHeader, textEditorContainer);
  }

  // 2. Title Image Settings Accordion
  const titleImageHeader = leftSidebar.querySelector('.title-image-header');
  const titleImageContainer = leftSidebar.querySelector('.title-image-container');
  if (titleImageHeader && titleImageContainer) {
    titleImageHeader.onclick = () => toggleAccordion(titleImageHeader, titleImageContainer);
  }

  // 3. Section Images Settings Accordion
  const secImagesHeader = leftSidebar.querySelector('.sec-images-header');
  const secImagesContainer = leftSidebar.querySelector('.section-images-container');
  if (secImagesHeader && secImagesContainer) {
    secImagesHeader.onclick = () => toggleAccordion(secImagesHeader, secImagesContainer);
  }

  // 4. Audio & Video Settings Accordion
  const audioVideoHeader = leftSidebar.querySelector('.audio-video-header');
  const audioVideoContainer = leftSidebar.querySelector('.audio-video-container');
  if (audioVideoHeader && audioVideoContainer) {
    audioVideoHeader.onclick = () => toggleAccordion(audioVideoHeader, audioVideoContainer);
  }

  // Right assets panel toggle (Mobile only)
  const toggleAssetSection = (element) => {
    if (window.innerWidth <= 768) {
      element.classList.toggle('collapsed');
      fitCanvasToWorkspace();
    }
  };

  const templatesHeader = paneTemplates.querySelector('.editor-section-header');
  if (templatesHeader) {
    templatesHeader.onclick = () => toggleAssetSection(paneTemplates);
  }

  const overlaysHeader = paneOverlays.querySelector('.editor-section-header');
  if (overlaysHeader) {
    overlaysHeader.onclick = () => toggleAssetSection(paneOverlays);
  }

  // Setup initial load collapsed states
  if (window.innerWidth <= 768) {
    // Mobile: Collapse all sections by default
    if (textEditorContainer) textEditorContainer.classList.add('collapsed');
    if (titleImageContainer) titleImageContainer.classList.add('collapsed');
    if (secImagesContainer) secImagesContainer.classList.add('collapsed');
    if (audioVideoContainer) audioVideoContainer.classList.add('collapsed');
    
    // Rotate all mobile chevrons
    document.querySelectorAll('.editor-sidebar .toggle-chevron').forEach(ch => {
      ch.style.transform = 'rotate(180deg)';
    });

    paneTemplates.classList.add('collapsed');
    paneOverlays.classList.add('collapsed');
  } else {
    // PC: Keep editor open, collapse image settings & audio video
    if (titleImageContainer) titleImageContainer.classList.add('collapsed');
    if (secImagesContainer) secImagesContainer.classList.add('collapsed');
    if (audioVideoContainer) audioVideoContainer.classList.add('collapsed');

    // Rotate PC chevrons for image/audio panels
    const tChevron = titleImageHeader ? titleImageHeader.querySelector('.toggle-chevron') : null;
    const sChevron = secImagesHeader ? secImagesHeader.querySelector('.toggle-chevron') : null;
    const avChevron = audioVideoHeader ? audioVideoHeader.querySelector('.toggle-chevron') : null;
    if (tChevron) tChevron.style.transform = 'rotate(180deg)';
    if (sChevron) sChevron.style.transform = 'rotate(180deg)';
    if (avChevron) avChevron.style.transform = 'rotate(180deg)';
  }
}

/**
 * Add Stamp Overlay Image to Canvas specifically for a section
 */
function addSectionImageToCanvas(index, dataUrl, coordsInfo = null) {
  // Remove existing section image at this index
  const existing = canvas.getObjects().find(o => o.isSectionImage && o.sectionIndex === index);
  if (existing) {
    canvas.remove(existing);
  }

  fabric.Image.fromURL(dataUrl, (img) => {
    const scaleX = originalWidth / 1200;
    const scaleY = originalHeight / 1600;

    let leftPos = 1060 * scaleX;
    let topPos = (345 + index * 225 + 85) * scaleY;
    let scaleVal = (140 * scaleX) / img.width; // Fits nicely (matches the stamp size)

    if (coordsInfo) {
      leftPos = coordsInfo.left;
      topPos = coordsInfo.top;
      scaleVal = coordsInfo.scaleX;
    }

    img.set({
      name: 'section-image-' + index,
      isSectionImage: true,
      sectionIndex: index,
      left: leftPos,
      top: topPos,
      scaleX: scaleVal,
      scaleY: scaleVal,
      originX: 'center',
      originY: 'center',
      cornerColor: '#6366F1',
      cornerSize: 12,
      transparentCorners: false,
      borderColor: '#6366F1',
      lockUniScaling: true,
      uniformScaling: true,
      hasRotatingPoint: false,
      lockMovementX: true,      // Lock position movement (X)
      lockMovementY: true,      // Lock position movement (Y)
      centeredScaling: true     // Keep center fixed when resizing
    });

    img.setControlsVisibility({
      mt: false,
      mb: false,
      ml: false,
      mr: false,
      mtr: false
    });

    canvas.add(img);
    activeSectionImages[index] = img;
    canvas.renderAll();

    updateSectionImageUI(index, dataUrl);
    saveSectionImagesToDb();
  });
}

/**
 * Add Stamp Overlay Image to Canvas specifically for the title right area
 */
function addTitleImageToCanvas(dataUrl, coordsInfo = null) {
  // Remove existing title image
  const existing = canvas.getObjects().find(o => o.isTitleImage);
  if (existing) {
    canvas.remove(existing);
  }

  fabric.Image.fromURL(dataUrl, (img) => {
    let scaleX = originalWidth / 1200;
    let scaleY = originalHeight / 1600;

    let leftPos = 1060 * scaleX; // Center of the narrowed stamp area shifted right (960 + 100 = 1060)
    let topPos = 165 * scaleY;
    let scaleVal = (200 * scaleY) / img.height; // Fits nicely in the title right area (matches the stamp size)

    if (coordsInfo) {
      leftPos = coordsInfo.left;
      topPos = coordsInfo.top;
      scaleVal = coordsInfo.scaleX;
    }

    img.set({
      name: 'title-image',
      isTitleImage: true,
      left: leftPos,
      top: topPos,
      scaleX: scaleVal,
      scaleY: scaleVal,
      originX: 'center',
      originY: 'center',
      cornerColor: '#6366F1',
      cornerSize: 12,
      transparentCorners: false,
      borderColor: '#6366F1',
      lockUniScaling: true,
      uniformScaling: true,
      hasRotatingPoint: false,
      lockMovementX: true,      // Lock position movement (X)
      lockMovementY: true,      // Lock position movement (Y)
      centeredScaling: true     // Keep center fixed when resizing
    });

    img.setControlsVisibility({
      mt: false,
      mb: false,
      ml: false,
      mr: false,
      mtr: false
    });

    canvas.add(img);
    activeTitleImage = img;
    canvas.renderAll();

    updateTitleImageUI(dataUrl);
    saveTitleImageToDb();

    // Redraw text to apply narrowed width
    triggerRenderDebounced();
  });
}

/**
 * Update the UI Preview for the title image
 */
function updateTitleImageUI(dataUrl) {
  const preview = document.getElementById('title-img-preview');
  const btnSelect = document.querySelector('.btn-select-title-image');
  
  if (preview && btnSelect) {
    if (dataUrl) {
      preview.querySelector('img').src = dataUrl;
      preview.style.display = 'flex';
      btnSelect.style.display = 'none';
    } else {
      preview.style.display = 'none';
      btnSelect.style.display = 'inline-flex';
    }
  }
}

/**
 * Save active title image configuration to IndexedDB configs
 */
async function saveTitleImageToDb() {
  if (!activeTemplate) return;
  
  let savedImageData = null;
  const currentImg = canvas.getObjects().find(o => o.isTitleImage);
  
  if (currentImg) {
    savedImageData = {
      data_url: currentImg._element.src,
      left: currentImg.left,
      top: currentImg.top,
      scaleX: currentImg.scaleX,
      scaleY: currentImg.scaleY
    };
  }

  let config = await db.configs.get(activeTemplate.id);
  if (!config) {
    config = {
      template_id: activeTemplate.id,
      title: activeCoords.title,
      sections: activeCoords.sections
    };
  }
  config.title_image = savedImageData;
  await db.configs.put(config);
}

/**
 * Load and render title image configuration from IndexedDB
 */
async function loadTitleImageFromDb() {
  // Clear existing title image on canvas
  const existing = canvas.getObjects().find(o => o.isTitleImage);
  if (existing) {
    canvas.remove(existing);
  }
  activeTitleImage = null;

  // Clear UI Preview
  updateTitleImageUI(null);

  if (!activeTemplate) return;

  const config = await db.configs.get(activeTemplate.id);
  if (config && config.title_image) {
    const imgData = config.title_image;
    await new Promise((resolve) => {
      fabric.Image.fromURL(imgData.data_url, (img) => {
        img.set({
          name: 'title-image',
          isTitleImage: true,
          left: imgData.left,
          top: imgData.top,
          scaleX: imgData.scaleX,
          scaleY: imgData.scaleY,
          originX: 'center',
          originY: 'center',
          cornerColor: '#6366F1',
          cornerSize: 12,
          transparentCorners: false,
          borderColor: '#6366F1',
          lockUniScaling: true,
          uniformScaling: true,
          hasRotatingPoint: false,
          lockMovementX: true,
          lockMovementY: true,
          centeredScaling: true
        });

        img.setControlsVisibility({
          mt: false,
          mb: false,
          ml: false,
          mr: false,
          mtr: false
        });

        canvas.add(img);
        activeTitleImage = img;
        updateTitleImageUI(imgData.data_url);
        resolve();
      });
    });
    canvas.renderAll();
  }
}

/**
 * Update the UI Preview for a specific section image
 */
function updateSectionImageUI(index, dataUrl) {
  const preview = document.getElementById(`sec-img-preview-${index}`);
  const btnSelect = document.querySelector(`.btn-select-sec-image[data-index="${index}"]`);
  
  if (preview && btnSelect) {
    if (dataUrl) {
      preview.querySelector('img').src = dataUrl;
      preview.style.display = 'flex';
      btnSelect.style.display = 'none';
    } else {
      preview.style.display = 'none';
      btnSelect.style.display = 'inline-flex';
    }
  }
}

/**
 * Save all active section image configurations to IndexedDB configs
 */
async function saveSectionImagesToDb() {
  if (!activeTemplate) return;
  
  const savedImagesData = [];
  const currentImages = canvas.getObjects().filter(o => o.isSectionImage);
  
  currentImages.forEach(img => {
    savedImagesData.push({
      sectionIndex: img.sectionIndex,
      data_url: img._element.src,
      left: img.left,
      top: img.top,
      scaleX: img.scaleX,
      scaleY: img.scaleY
    });
  });

  let config = await db.configs.get(activeTemplate.id);
  if (!config) {
    config = {
      template_id: activeTemplate.id,
      title: activeCoords.title,
      sections: activeCoords.sections
    };
  }
  config.section_images = savedImagesData;
  await db.configs.put(config);
}

/**
 * Load and render section image configurations from IndexedDB
 */
async function loadSectionImagesFromDb() {
  // Clear existing section images on canvas
  const existing = canvas.getObjects().filter(o => o.isSectionImage);
  existing.forEach(o => canvas.remove(o));
  activeSectionImages.fill(null);

  // Clear UI Previews
  for (let i = 0; i < 5; i++) {
    updateSectionImageUI(i, null);
  }

  if (!activeTemplate) return;

  const config = await db.configs.get(activeTemplate.id);
  if (config && config.section_images) {
    for (const imgData of config.section_images) {
      // Load image asynchronously and place on canvas
      await new Promise((resolve) => {
        fabric.Image.fromURL(imgData.data_url, (img) => {
          img.set({
            name: 'section-image-' + imgData.sectionIndex,
            isSectionImage: true,
            sectionIndex: imgData.sectionIndex,
            left: imgData.left,
            top: imgData.top,
            scaleX: imgData.scaleX,
            scaleY: imgData.scaleY,
            originX: 'center',
            originY: 'center',
            cornerColor: '#6366F1',
            cornerSize: 12,
            transparentCorners: false,
            borderColor: '#6366F1',
            lockUniScaling: true,
            uniformScaling: true,
            hasRotatingPoint: false
          });

          img.setControlsVisibility({
            mt: false,
            mb: false,
            ml: false,
            mr: false,
            mtr: false
          });

          canvas.add(img);
          activeSectionImages[imgData.sectionIndex] = img;
          updateSectionImageUI(imgData.sectionIndex, imgData.data_url);
          resolve();
        });
      });
    }
    canvas.renderAll();
  }
}

/**
 * Open Modal to choose transparent stamp overlay for a section
 */
async function openSelectOverlayModal() {
  const modal = document.getElementById('select-overlay-modal');
  const grid = document.getElementById('modal-overlays-grid');
  grid.innerHTML = '';
  
  const list = await db.overlays.orderBy('created_at').reverse().toArray();
  
  if (list.length === 0) {
    grid.innerHTML = '<div style="grid-column: span 3; text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">登録されている透過スタンプがありません。「スタンプ」タブからアップロードしてください。</div>';
  } else {
    list.forEach(o => {
      const card = document.createElement('div');
      card.className = 'asset-card overlay-card';
      
      const img = document.createElement('img');
      img.src = o.data_url;
      card.appendChild(img);
      
      card.onclick = () => {
        if (selectingSectionIndex === 'title') {
          addTitleImageToCanvas(o.data_url);
        } else if (selectingSectionIndex !== null) {
          addSectionImageToCanvas(selectingSectionIndex, o.data_url);
        }
        closeSelectOverlayModal();
      };
      
      grid.appendChild(card);
    });
  }
  
  modal.style.display = 'flex';
}

/**
 * Close transparent stamp selection modal
 */
function closeSelectOverlayModal() {
  document.getElementById('select-overlay-modal').style.display = 'none';
  selectingSectionIndex = null;
}

/**
 * Initialize section image configurations UI event listeners
 */
function initSectionImagesUI() {
  // --- Section Images UI Bindings ---
  // Bind Select button click
  document.querySelectorAll('.btn-select-sec-image').forEach(btn => {
    btn.onclick = () => {
      selectingSectionIndex = parseInt(btn.getAttribute('data-index'));
      openSelectOverlayModal();
    };
  });

  // Bind Close select modal
  const btnCloseSelectModal = document.getElementById('btn-close-select-modal');
  if (btnCloseSelectModal) {
    btnCloseSelectModal.onclick = closeSelectOverlayModal;
  }

  // Bind Clear button click
  document.querySelectorAll('.btn-clear-sec-image').forEach(btn => {
    btn.onclick = () => {
      const index = parseInt(btn.getAttribute('data-index'));
      const obj = activeSectionImages[index];
      if (obj) {
        canvas.remove(obj);
        canvas.renderAll();
      }
      activeSectionImages[index] = null;
      updateSectionImageUI(index, null);
      saveSectionImagesToDb();
      showToast('セクション画像を削除しました', 'warning');
    };
  });

  // --- Title Image UI Bindings ---
  const btnSelectTitle = document.querySelector('.btn-select-title-image');
  if (btnSelectTitle) {
    btnSelectTitle.onclick = () => {
      selectingSectionIndex = 'title';
      openSelectOverlayModal();
    };
  }

  const btnClearTitle = document.querySelector('.btn-clear-title-image');
  if (btnClearTitle) {
    btnClearTitle.onclick = () => {
      const obj = activeTitleImage;
      if (obj) {
        canvas.remove(obj);
        canvas.renderAll();
      }
      activeTitleImage = null;
      updateTitleImageUI(null);
      saveTitleImageToDb();
      showToast('タイトル画像を削除しました', 'warning');
      triggerRenderDebounced(); // Redraw text to fill back wide layout
    };
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
      initCollapsibleSections();
      initSectionImagesUI();
      initAudioVideoFeatures();

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

// ============================================================================
// AUDIO & VIDEO GENERATION FEATURES (STAMP AND HIGHLIGHT SYNC)
// ============================================================================

// Audio & Video Generation State
let loadedAudioBuffer = null;
let activeAudioFile = null;
let activeVideoRecorder = null;
let activeVideoAudioSource = null;
let isVideoRendering = false;

/**
 * Initialize Audio & Video Settings Features
 */
function initAudioVideoFeatures() {
  const inputAudioFile = document.getElementById('input-audio-file');
  const uploadAudioZone = document.getElementById('upload-audio-zone');
  const btnDetectSilence = document.getElementById('btn-detect-silence');
  const btnGenerateTimestampTemplate = document.getElementById('btn-generate-timestamp-template');
  const timestampInput = document.getElementById('timestamp-input');
  
  const btnExportVideo34 = document.getElementById('btn-export-video-34');
  const btnExportVideo916a = document.getElementById('btn-export-video-916a');
  const btnExportVideo916b = document.getElementById('btn-export-video-916b');
  
  const btnCancelVideoRender = document.getElementById('btn-cancel-video-render');

  // Drag and drop for audio zone
  setupDragAndDrop(uploadAudioZone, handleAudioFile);
  inputAudioFile.onchange = (e) => handleAudioFile(e.target.files[0]);

  // Audio file handler
  async function handleAudioFile(file) {
    if (!file) return;
    if (!file.type.match('audio/mp3') && !file.type.match('audio/mpeg') && !file.type.match('audio/*') && !file.name.endsWith('.mp3')) {
      showToast('音声にはMP3ファイルを指定してください。', 'danger');
      return;
    }

    activeAudioFile = file;
    document.getElementById('audio-filename').innerText = file.name;
    
    const previewEl = document.getElementById('preview-audio-el');
    previewEl.src = URL.createObjectURL(file);
    document.getElementById('audio-player-preview').style.display = 'block';

    showToast('音声ファイルを読み込み中...', 'warning');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      loadedAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();
      
      btnDetectSilence.disabled = false;
      btnExportVideo34.disabled = false;
      btnExportVideo916a.disabled = false;
      btnExportVideo916b.disabled = false;
      
      showToast('音声のデコードが完了しました！');
    } catch (err) {
      console.error('Audio decode failed:', err);
      showToast('音声のデコードに失敗しました。', 'danger');
    }
  }

  // Generate template timestamp
  btnGenerateTimestampTemplate.onclick = () => {
    const parsed = parseXMLText(xmlInput.value);
    let template = "";
    let currentSec = 0;
    
    parsed.sections.forEach((sec, i) => {
      if (sec.row1 || sec.row2 || sec.row3) {
        template += `00:${String(currentSec).padStart(2, '0')} セクション${i + 1}\n`;
        currentSec += 5; // 5秒刻みで仮設定
      }
    });
    
    timestampInput.value = template.trim();
    showToast('タイムスタンプの雛形を生成しました');
  };

  // Silence/Pause Detection for Auto Timestamps
  btnDetectSilence.onclick = async () => {
    if (!loadedAudioBuffer) return;
    
    showToast('波形を解析中...', 'warning');
    
    try {
      const timestamps = detectSilenceTransitions(loadedAudioBuffer);
      if (timestamps.length === 0) {
        showToast('無音区間を検出できませんでした。構成から雛形を生成してください。', 'danger');
        return;
      }
      
      // XML構成から実在するターゲット一覧を取得
      const parsed = parseXMLText(xmlInput.value);
      const targets = [];
      parsed.sections.forEach((sec, i) => {
        if (sec.row1 || sec.row2 || sec.row3) {
          targets.push(`セクション${i + 1}`);
        }
      });

      // 検出された開始時間にターゲットをマッピング
      let resultText = "";
      for (let i = 0; i < Math.min(timestamps.length, targets.length); i++) {
        const time = timestamps[i];
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const ms = Math.floor((time % 1) * 100);
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
        resultText += `${timeStr} ${targets[i]}\n`;
      }

      timestampInput.value = resultText.trim();
      showToast('音声からタイムスタンプを自動検出しました！');
    } catch (err) {
      console.error('Silence detection error:', err);
      showToast('解析中にエラーが発生しました。', 'danger');
    }
  };

  // Export buttons
  btnExportVideo34.onclick = () => exportVideo('3:4');
  btnExportVideo916a.onclick = () => exportVideo('9:16-A');
  btnExportVideo916b.onclick = () => exportVideo('9:16-B');

  // Cancel rendering
  btnCancelVideoRender.onclick = () => {
    if (activeVideoRecorder && isVideoRendering) {
      activeVideoRecorder.stop();
      if (activeVideoAudioSource) {
        try { activeVideoAudioSource.stop(); } catch(e){}
      }
      isVideoRendering = false;
      document.getElementById('video-render-modal').style.display = 'none';
      showToast('動画の書き出しをキャンセルしました', 'danger');
    }
  };
}

/**
 * Silence transitions detection logic
 */
function detectSilenceTransitions(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0); // Left channel
  const sampleRate = audioBuffer.sampleRate;
  
  // スキャン設定パラメータ
  const windowSize = Math.round(sampleRate * 0.05); // 50ms 窓
  const stepSize = Math.round(sampleRate * 0.02);   // 20ms 移動
  const duration = audioBuffer.duration;
  
  // 閾値計算 (最大振幅の 3.5% を無音閾値にする)
  let maxVal = 0;
  for (let i = 0; i < channelData.length; i += 100) {
    const v = Math.abs(channelData[i]);
    if (v > maxVal) maxVal = v;
  }
  const silenceThreshold = maxVal * 0.035;
  
  // 各ステップの音量を計算
  const volumes = [];
  for (let offset = 0; offset < channelData.length - windowSize; offset += stepSize) {
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      sum += Math.abs(channelData[offset + i]);
    }
    const avg = sum / windowSize;
    volumes.push({ time: offset / sampleRate, vol: avg });
  }

  // 無音 (Silence) か有音 (Speech) かのステート判定
  const minSilenceDur = 0.6; // 0.6秒以上のポーズを文の区切りとする
  const speechStates = []; // { start, end }
  let inSpeech = false;
  let speechStart = 0;
  let silenceStart = 0;

  for (let i = 0; i < volumes.length; i++) {
    const isSilence = volumes[i].vol < silenceThreshold;
    const time = volumes[i].time;

    if (!inSpeech) {
      if (!isSilence) {
        inSpeech = true;
        speechStart = time;
      }
    } else {
      if (isSilence) {
        if (silenceStart === 0) {
          silenceStart = time;
        } else if (time - silenceStart >= minSilenceDur) {
          inSpeech = false;
          speechStates.push({ start: speechStart, end: silenceStart });
          silenceStart = 0;
        }
      } else {
        silenceStart = 0; // 有音に戻った
      }
    }
  }

  // 最後の有音ブロックを追加
  if (inSpeech) {
    speechStates.push({ start: speechStart, end: duration });
  }

  // 各発話ブロックの開始秒数をタイムスタンプ候補として返す
  // 最初の発話（タイトル）は 0.0秒からにするのが自然なため強制的に 0.0 に補正
  const timestamps = speechStates.map((s, idx) => idx === 0 ? 0.0 : s.start);
  return timestamps;
}

/**
 * Parse input timestamp text
 */
function parseTimestampText(text) {
  const lines = text.split('\n');
  const list = [];
  
  lines.forEach(line => {
    line = line.trim();
    if (!line) return;
    
    // hh:mm:ss.SS or mm:ss.SS
    const match = line.match(/^(\d{1,2}:)?(\d{1,2}):(\d{1,2})(\.\d+)?/);
    if (match) {
      const timeStr = match[0];
      const rest = line.substring(timeStr.length).trim();
      
      const parts = timeStr.split(':');
      let seconds = 0;
      if (parts.length === 3) {
        seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
      }
      
      let target = 'title';
      if (rest.includes('1') || rest.toLowerCase().includes('section1') || rest.includes('セクション1')) target = 'section1';
      else if (rest.includes('2') || rest.toLowerCase().includes('section2') || rest.includes('セクション2')) target = 'section2';
      else if (rest.includes('3') || rest.toLowerCase().includes('section3') || rest.includes('セクション3')) target = 'section3';
      else if (rest.includes('4') || rest.toLowerCase().includes('section4') || rest.includes('セクション4')) target = 'section4';
      else if (rest.includes('5') || rest.toLowerCase().includes('section5') || rest.includes('セクション5')) target = 'section5';
      else if (rest.toLowerCase().includes('title') || rest.includes('タイトル')) target = 'title';
      
      list.push({ time: seconds, target: target });
    }
  });

  list.sort((a, b) => a.time - b.time);
  return list;
}

/**
 * Canvas highlight and transfer rendering
 */
function drawHighlightOnRecordingCanvas(ctx, target, scaleX, scaleY) {
  ctx.save();
  let x, y, w, h;
  if (target === 'title') {
    x = 80 * scaleX;
    y = 75 * scaleY;
    w = 880 * scaleX;
    h = 180 * scaleY;
  } else if (target.startsWith('section')) {
    const idx = parseInt(target.replace('section', '')) - 1;
    x = 270 * scaleX;
    y = (345 + idx * 225) * scaleY;
    w = 850 * scaleX;
    h = 170 * scaleY;
  } else {
    ctx.restore();
    return;
  }

  // Draw light yellow semi-transparent background
  ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
  ctx.fillRect(x, y, w, h);

  // Draw thick coral highlight border
  ctx.strokeStyle = '#D3544C';
  ctx.lineWidth = 6 * Math.min(scaleX, scaleY);
  ctx.strokeRect(x, y, w, h);

  ctx.restore();
}

/**
 * Draw Fabric.js user overlays onto recording context
 */
function drawFabricObjectsOnRecordingCanvas(ctx, scaleX, scaleY) {
  const objects = canvas.getObjects();
  
  objects.forEach(obj => {
    // Skip guide borders and layout boxes
    if (obj.name === 'title' && !obj.isTitleImage) return;
    if (obj.name?.startsWith('section') && !obj.isSectionImage) return;
    if (!obj._element) return;

    ctx.save();
    
    // Calculate global position centered on the object
    const center = obj.getCenterPoint();
    ctx.translate(center.x * scaleX, center.y * scaleY);
    ctx.rotate((obj.angle || 0) * Math.PI / 180);

    const flipX = obj.flipX ? -1 : 1;
    const flipY = obj.flipY ? -1 : 1;
    ctx.scale(obj.scaleX * scaleX * flipX, obj.scaleY * scaleY * flipY);

    const w = obj.width;
    const h = obj.height;

    ctx.globalAlpha = obj.opacity ?? 1;
    ctx.drawImage(obj._element, -w / 2, -h / 2, w, h);
    
    ctx.restore();
  });
}

/**
 * Draw Down Arrow (↓) for Pattern B
 */
function drawDownArrowIcon(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = '#D3544C'; // Coral red
  
  // Arrow line/shaft
  const shaftW = size * 0.24;
  const shaftH = size * 0.45;
  ctx.fillRect(x - shaftW / 2, y - size * 0.15, shaftW, shaftH);
  
  // Arrow head (triangle)
  ctx.beginPath();
  ctx.moveTo(x - size * 0.45, y + size * 0.25);
  ctx.lineTo(x + size * 0.45, y + size * 0.25);
  ctx.lineTo(x, y + size * 0.7);
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
}

/**
 * Core Video Rendering & Audio Recording Engine
 */
async function exportVideo(layoutType) {
  if (!loadedAudioBuffer || !activeAudioFile) {
    showToast('音声ファイルがロードされていません。', 'danger');
    return;
  }

  const parsedTimestamps = parseTimestampText(document.getElementById('timestamp-input').value);
  if (parsedTimestamps.length === 0) {
    showToast('タイムスタンプを入力するか、自動検出を行ってください。', 'danger');
    return;
  }

  // Setup UI
  const progressModal = document.getElementById('video-render-modal');
  const progressBar = document.getElementById('video-render-progress');
  const progressPercent = document.getElementById('video-render-percent');
  
  progressModal.style.display = 'flex';
  progressBar.style.width = '0%';
  progressPercent.innerText = '0%';
  
  isVideoRendering = true;

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    
    // Create Audio Buffer Source node
    const sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = loadedAudioBuffer;
    sourceNode.connect(dest);
    sourceNode.connect(audioCtx.destination); // Play locally so user can hear / sync
    activeVideoAudioSource = sourceNode;

    // Define dimensions based on layout type
    const recordWidth = 1200;
    // 3:4 is 1200x1600. 9:16 is 1200x2134 (1200 * 16 / 9 = 2133.33)
    const recordHeight = layoutType === '3:4' ? 1600 : 2134;

    // Create recording canvas
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = recordWidth;
    recordCanvas.height = recordHeight;
    const ctx = recordCanvas.getContext('2d');

    // Create offscreen template drawing canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1200;
    tempCanvas.height = 1600;
    const tempCtx = tempCanvas.getContext('2d');

    // Setup base background image
    const templateImg = new Image();
    await new Promise((resolve) => {
      templateImg.onload = resolve;
      templateImg.src = activeTemplate.data_url;
    });

    const parsedText = parseXMLText(xmlInput.value);

    // Audio stream and Canvas stream capture
    const canvasStream = recordCanvas.captureStream(30); // 30 FPS Capture
    const combinedStream = new MediaStream();
    
    canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
    dest.stream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

    // Determine compatible video mimeType
    let selectedMime = 'video/webm';
    const mimes = [
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=h264',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const mime of mimes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }
    console.log('Selected recorder mimeType:', selectedMime);

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 3000000 // 3.0 Mbps
    });
    activeVideoRecorder = recorder;

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (!isVideoRendering) {
        audioCtx.close();
        return; // Cancelled
      }
      
      const blob = new Blob(chunks, { type: selectedMime });
      const url = URL.createObjectURL(blob);
      
      // Clean filename based on XML title
      let cleanTitle = (parsedText.title || '').replace(/<[^>]*>/g, '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').trim();
      const filename = cleanTitle ? `${cleanTitle}_${layoutType.replace(':', '')}.mp4` : `video_${Date.now()}_${layoutType.replace(':', '')}.mp4`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Reset UI state
      progressModal.style.display = 'none';
      isVideoRendering = false;
      showToast('動画の書き出しが完了しました！');
      audioCtx.close();
    };

    // Start audio & video recording
    recorder.start();
    sourceNode.start(0);
    const startTime = audioCtx.currentTime;
    const duration = loadedAudioBuffer.duration + 1.0; // 音声終了+1秒余裕

    // Main animation frame loop
    function renderLoop() {
      if (!isVideoRendering) return;

      const elapsed = audioCtx.currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      
      progressBar.style.width = `${progress * 100}%`;
      progressPercent.innerText = `${Math.round(progress * 100)}%`;

      if (elapsed >= duration) {
        recorder.stop();
        return;
      }

      // 1. Determine active highlight target based on elapsed time
      let activeTarget = null;
      for (let i = parsedTimestamps.length - 1; i >= 0; i--) {
        if (elapsed >= parsedTimestamps[i].time) {
          activeTarget = parsedTimestamps[i].target;
          break;
        }
      }

      // 2. Draw 1200x1600 main graphic into tempCanvas
      tempCtx.clearRect(0, 0, 1200, 1600);
      tempCtx.drawImage(templateImg, 0, 0, 1200, 1600);
      
      if (activeTarget) {
        drawHighlightOnRecordingCanvas(tempCtx, activeTarget, 1.0, 1.0);
      }
      
      renderTextOnCanvas(tempCtx, parsedText, activeCoords);
      drawFabricObjectsOnRecordingCanvas(tempCtx, 1.0, 1.0);

      // 3. Render and composite onto recording canvas
      ctx.clearRect(0, 0, recordWidth, recordHeight);
      
      if (layoutType === '3:4') {
        // Draw directly
        ctx.drawImage(tempCanvas, 0, 0);
      } else {
        // 9:16 layout
        // Fill white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, recordWidth, recordHeight);

        // Center 1200x1600 main graphic (Y: 267)
        ctx.drawImage(tempCanvas, 0, 267, 1200, 1600);

        if (layoutType === '9:16-A') {
          // Pattern A: Both blocks are full-width (1040px)
          drawRichCTABox(ctx, 'チャンネル登録・高評価お願いします！', 80, 73, 1040, 120);
          drawRichCTABox(ctx, '使いたい表現をコメントしてください！', 80, 1940, 1040, 120);
        } else if (layoutType === '9:16-B') {
          // Pattern B: Top block is full-width (1040px), Bottom block is narrow (900px) to leave space for the arrow
          drawRichCTABox(ctx, '使いたい表現をコメントしてください！', 80, 73, 1040, 120);
          drawRichCTABox(ctx, '復習できるように今すぐ保存', 80, 1940, 880, 120);
          
          // Draw Red Down Arrow on bottom-right (Instagram Bookmark overlay area)
          // Centered at X: 1080 (in the 240px space after the box), Y: 2000, Size: 60px
          drawDownArrowIcon(ctx, 1085, 2000, 64);
        }
      }

      requestAnimationFrame(renderLoop);
    }

    // Start frame loop
    renderLoop();

  } catch (err) {
    console.error('Video generation failed:', err);
    showToast('動画の書き出しに失敗しました。', 'danger');
    progressModal.style.display = 'none';
    isVideoRendering = false;
  }
}

/**
 * Draw a rich styled CTA Box matching infographic theme (Beige box, Navy border, Coral shadow)
 */
function drawRichCTABox(ctx, text, x, y, w, h) {
  ctx.save();
  
  const navyColor = '#1E314B';
  const coralColor = '#D3544C';

  // 1. Draw Drop Shadow (offset 8px right and down)
  ctx.fillStyle = coralColor;
  ctx.fillRect(x + 8, y + 8, w, h);

  // 2. Draw Main Rectangle Background (Creamy Beige)
  ctx.fillStyle = '#F7F4EB'; // Matches Cream Background of the main template
  ctx.fillRect(x, y, w, h);

  // 3. Draw Thick Navy Border
  ctx.strokeStyle = navyColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(x, y, w, h);

  // 4. Draw Center Text
  ctx.fillStyle = navyColor;
  ctx.font = "bold 34px 'Segoe UI', 'Noto Sans JP', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);

  ctx.restore();
}

