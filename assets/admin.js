/* ============================================================================
   Admin panel behaviour.

   Everything here is convenience. The database decides what is allowed: the
   policies in supabase/schema.sql are checked by Postgres on every request, so
   a disabled button is a courtesy and never the protection.
   ========================================================================= */
(() => {
  'use strict';
  const db = window.SisiDB;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag);
    if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // the tags the editor can actually show. Anything a product carries beyond
  // this list has no checkbox, so it has to survive a save untouched.
  const TAG_CHECKBOXES = [...document.querySelectorAll('.field.tags input')].map(c => c.value);

  /* ---------- toasts ---------- */
  const toastHost = $('#toasts');
  function toast(msg, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    toastHost.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  /* ---------- confirm dialog ---------- */
  const confirmBox = $('#confirm');
  let confirmResolve = null;
  function askConfirm(title, text, okLabel) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = okLabel || 'מחיקה';
    confirmBox.hidden = false;
    $('#confirmNo').focus();
    return new Promise(res => { confirmResolve = res; });
  }
  const closeConfirm = v => { confirmBox.hidden = true; if (confirmResolve) { confirmResolve(v); confirmResolve = null; } };
  $('#confirmNo').addEventListener('click', () => closeConfirm(false));
  $('#confirmYes').addEventListener('click', () => closeConfirm(true));

  /* ---------- state ---------- */
  let products = [], categories = [], me = null, editing = null;

  /* ---------- sign in ---------- */
  const authView = $('#authView'), shellView = $('#shellView');
  if (!db.configured) {
    $('#authNote').textContent = 'המערכת עדיין לא חוברה למסד הנתונים. יש למלא את assets/db-config.js לפי supabase/SETUP.md.';
    $('#loginBtn').disabled = true;
  }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#loginError');
    err.hidden = true;
    const btn = $('#loginBtn');
    btn.disabled = true; btn.textContent = 'מתחבר…';
    try {
      await db.signIn($('#email').value.trim(), $('#password').value);
      const who = await db.whoAmI();
      if (!who) {                       // signed in, but not on the staff list
        await db.signOut();
        throw new Error('not-staff');
      }
      me = who;
      await enterPanel();
    } catch (ex) {
      err.hidden = false;
      err.textContent =
        ex.message === 'bad-credentials' ? 'אימייל או סיסמה שגויים.' :
        ex.message === 'not-staff'       ? 'המשתמש הזה אינו מורשה לנהל את האתר.' :
        ex.message === 'db-not-configured' ? 'המערכת לא חוברה למסד הנתונים.' :
        'ההתחברות נכשלה. נסו שוב בעוד רגע.';
    } finally {
      btn.disabled = false; btn.textContent = 'כניסה';
    }
  });

  $('#signOut').addEventListener('click', async () => {
    await db.signOut();
    location.reload();
  });

  async function enterPanel() {
    authView.hidden = true;
    shellView.hidden = false;
    $('#whoAmI').textContent = (me.display_name || '') + (me.role === 'admin' ? ' · מנהל' : ' · צוות');
    // staff may manage the menu but not the business settings; the database
    // enforces this too, so this only avoids a pointless rejected save
    if (me.role !== 'admin') {
      document.querySelector('[data-view="settings"]').hidden = true;
      $('#settingsNote').textContent = 'רק מנהל יכול לשנות את ההגדרות.';
    }
    await Promise.all([loadCategories(), loadProducts(), loadSettings()]);
  }

  /* ---------- navigation ---------- */
  document.querySelectorAll('.side-link').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.side-link').forEach(x => x.classList.toggle('is-on', x === b));
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + b.dataset.view; });
  }));

  /* ---------- load ---------- */
  async function loadCategories() {
    try {
      categories = await db.listCategories() || [];
      const sel = $('#p_category'), filt = $('#catFilter');
      sel.textContent = '';
      filt.textContent = '';
      filt.appendChild(new Option('כל הקטגוריות', ''));
      categories.forEach(c => { sel.appendChild(new Option(c.name, c.name)); filt.appendChild(new Option(c.name, c.name)); });
      renderCategories();
    } catch (ex) { toast('טעינת הקטגוריות נכשלה', 'err'); }
  }

  async function loadProducts() {
    const loading = $('#productLoading');
    loading.hidden = false;
    try {
      products = await db.listProducts() || [];
      renderProducts();
    } catch (ex) {
      $('#productEmpty').hidden = false;
      $('#productEmpty').textContent = 'לא הצלחנו לטעון את המוצרים. בדקו את החיבור ונסו לרענן.';
    } finally { loading.hidden = true; }
  }

  async function loadSettings() {
    try {
      const s = await db.getSettings();
      if (!s) return;
      $('#s_business_name').value = s.business_name || '';
      $('#s_phone').value = s.phone || '';
      $('#s_whatsapp').value = s.whatsapp || '';
      $('#s_address').value = s.address || '';
      $('#s_accepting_orders').checked = !!s.accepting_orders;
      $('#s_notice').value = s.notice || '';
    } catch (ex) { /* the settings view simply stays empty */ }
  }

  /* ---------- render: products ---------- */
  function visibleProducts() {
    const q = $('#search').value.trim();
    const cat = $('#catFilter').value;
    const avail = $('#availFilter').value;
    return products.filter(p => {
      if (cat && p.category !== cat) return false;
      if (avail === 'yes' && (!p.available || p.hidden)) return false;
      if (avail === 'no' && p.available) return false;
      if (avail === 'hidden' && !p.hidden) return false;
      if (q && !((p.name + ' ' + (p.description || '')).includes(q))) return false;
      return true;
    });
  }

  function priceCell(p) {
    const wrap = el('span', 'price');
    if (p.price == null) { wrap.textContent = 'בטלפון'; return wrap; }
    if (p.sale_price != null) {
      wrap.appendChild(el('del', null, Number(p.price) + ' ₪'));
      wrap.appendChild(document.createTextNode(Number(p.sale_price) + ' ₪'));
    } else wrap.textContent = Number(p.price) + ' ₪';
    return wrap;
  }

  function renderProducts() {
    const rows = $('#productRows'), list = visibleProducts();
    rows.textContent = '';
    $('#productCount').textContent =
      products.length + ' מנות · ' + products.filter(p => !p.available).length + ' אזלו · ' +
      products.filter(p => p.hidden).length + ' מוסתרות';
    $('#productEmpty').hidden = list.length > 0;
    if (!list.length) {
      $('#productEmpty').textContent = products.length
        ? 'אין מנות שמתאימות לסינון.'
        : 'עוד אין מנות. אפשר להוסיף את הראשונה בכפתור למעלה.';
      return;
    }
    list.forEach(p => {
      const tr = el('tr');
      const c1 = el('td'); c1.dataset.label = 'מנה';
      c1.appendChild(el('span', 'cell-name', p.name));
      if (p.description) c1.appendChild(el('span', 'cell-desc', p.description));
      const c2 = el('td', null, p.category); c2.dataset.label = 'קטגוריה';
      const c3 = el('td'); c3.dataset.label = 'מחיר'; c3.appendChild(priceCell(p));
      const c4 = el('td'); c4.dataset.label = 'זמינות';
      c4.appendChild(el('span', p.hidden ? 'pill pill-hidden' : p.available ? 'pill pill-on' : 'pill pill-off',
        p.hidden ? 'מוסתר' : p.available ? 'זמין' : 'אזל מהמלאי'));
      const c5 = el('td');
      const acts = el('div', 'row-actions');
      const toggle = el('button', 'mini', p.available ? 'סימון כאזל' : 'החזרה למלאי');
      toggle.type = 'button';
      toggle.addEventListener('click', () => setAvailability(p, !p.available, toggle));
      const edit = el('button', 'mini', 'עריכה');
      edit.type = 'button';
      edit.addEventListener('click', () => openEditor(p));
      acts.append(toggle, edit);
      c5.appendChild(acts);
      tr.append(c1, c2, c3, c4, c5);
      rows.appendChild(tr);
    });
  }

  ['#search', '#catFilter', '#availFilter'].forEach(s =>
    $(s).addEventListener('input', renderProducts));

  /* one click, the thing the owner does most */
  async function setAvailability(p, next, btn) {
    btn.disabled = true;
    try {
      await db.updateProduct(p.id, { available: next });
      p.available = next;
      renderProducts();
      toast(p.name + (next ? ' חזרה למלאי' : ' סומנה כאזלה'), 'ok');
    } catch (ex) {
      toast('העדכון נכשל: ' + friendly(ex), 'err');
      btn.disabled = false;
    }
  }

  /* ---------- render: categories ---------- */
  function renderCategories() {
    const rows = $('#categoryRows');
    rows.textContent = '';
    $('#categoryEmpty').hidden = categories.length > 0;
    if (!categories.length) { $('#categoryEmpty').textContent = 'עוד אין קטגוריות.'; return; }
    categories.forEach(c => {
      const count = products.filter(p => p.category === c.name).length;
      const tr = el('tr');
      const c1 = el('td', 'cell-name', c.name); c1.dataset.label = 'שם';
      const c2 = el('td'); c2.dataset.label = 'סדר';
      const sort = el('input'); sort.type = 'number'; sort.step = '10'; sort.value = c.sort;
      sort.style.width = '5rem';
      sort.addEventListener('change', async () => {
        try { await db.updateCategory(c.id, { sort: Number(sort.value) || 0 }); c.sort = Number(sort.value) || 0; toast('הסדר נשמר', 'ok'); }
        catch (ex) { toast('שמירת הסדר נכשלה', 'err'); sort.value = c.sort; }
      });
      c2.appendChild(sort);
      const c3 = el('td', null, String(count)); c3.dataset.label = 'מנות';
      const c4 = el('td');
      const acts = el('div', 'row-actions');
      const del = el('button', 'mini', 'מחיקה'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (count) { toast('אי אפשר למחוק קטגוריה עם ' + count + ' מנות', 'err'); return; }
        if (!await askConfirm('מחיקת קטגוריה', 'למחוק את "' + c.name + '"?')) return;
        try { await db.deleteCategory(c.id); categories = categories.filter(x => x.id !== c.id); renderCategories(); toast('הקטגוריה נמחקה', 'ok'); }
        catch (ex) { toast('המחיקה נכשלה: ' + friendly(ex), 'err'); }
      });
      acts.appendChild(del);
      c4.appendChild(acts);
      tr.append(c1, c2, c3, c4);
      rows.appendChild(tr);
    });
  }

  $('#newCategory').addEventListener('click', async () => {
    const name = prompt('שם הקטגוריה החדשה');
    if (!name || !name.trim()) return;
    try {
      const made = await db.createCategory({ name: name.trim(), sort: (categories.length + 1) * 10 });
      categories = categories.concat(made || []);
      await loadCategories();
      toast('הקטגוריה נוספה', 'ok');
    } catch (ex) { toast('ההוספה נכשלה: ' + friendly(ex), 'err'); }
  });

  /* ---------- product editor ---------- */
  const editor = $('#editor');
  function openEditor(p) {
    editing = p || null;
    $('#editorTitle').textContent = p ? 'עריכת מוצר' : 'מוצר חדש';
    $('#p_name').value = p ? p.name : '';
    $('#p_description').value = p ? (p.description || '') : '';
    $('#p_price').value = p && p.price != null ? Number(p.price) : '';
    $('#p_sale_price').value = p && p.sale_price != null ? Number(p.sale_price) : '';
    $('#p_category').value = p ? p.category : (categories[0] && categories[0].name) || '';
    $('#p_sort').value = p ? p.sort : (products.length + 1) * 10;
    $('#p_image_url').value = p ? (p.image_url || '') : '';
    $('#p_available').checked = p ? !!p.available : true;
    $('#p_hidden').checked = p ? !!p.hidden : false;
    const tags = (p && p.tags) || [];
    document.querySelectorAll('.field.tags input').forEach(c => { c.checked = tags.includes(c.value); });
    $('#deleteProduct').hidden = !p;
    $('#editorError').hidden = true;
    editor.hidden = false;
    $('#p_name').focus();
  }
  const closeEditor = () => { editor.hidden = true; editing = null; };
  $('#editorClose').addEventListener('click', closeEditor);
  $('#editorCancel').addEventListener('click', closeEditor);
  $('#newProduct').addEventListener('click', () => {
    if (!categories.length) { toast('צריך ליצור קטגוריה אחת לפחות קודם', 'err'); return; }
    openEditor(null);
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!confirmBox.hidden) closeConfirm(false);
    else if (!editor.hidden) closeEditor();
  });

  $('#editorForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#editorError');
    err.hidden = true;
    const price = $('#p_price').value.trim();
    const sale = $('#p_sale_price').value.trim();
    const row = {
      name: $('#p_name').value.trim(),
      description: $('#p_description').value.trim(),
      price: price === '' ? null : Number(price),
      sale_price: sale === '' ? null : Number(sale),
      category: $('#p_category').value,
      // the editor only offers four checkboxes, but the menu uses more tags than
      // that (סחוג אדום carries חריף מאוד). Rebuilding from the checkboxes alone
      // would drop every tag without one, so carry the unrepresented ones over.
      tags: [
        ...[...document.querySelectorAll('.field.tags input')].filter(c => c.checked).map(c => c.value),
        ...(((editing && editing.tags) || []).filter(t => !TAG_CHECKBOXES.includes(t)))
      ],
      sort: Number($('#p_sort').value) || 0,
      image_url: $('#p_image_url').value.trim() || null,
      available: $('#p_available').checked,
      hidden: $('#p_hidden').checked
    };
    // the database checks these too; catching them here saves a round trip
    if (!row.name) { err.hidden = false; err.textContent = 'צריך שם למנה.'; return; }
    if (row.price != null && row.price < 0) { err.hidden = false; err.textContent = 'מחיר לא יכול להיות שלילי.'; return; }
    if (row.sale_price != null && row.price != null && row.sale_price > row.price) {
      err.hidden = false; err.textContent = 'מחיר המבצע גבוה מהמחיר הרגיל.'; return;
    }
    const btn = $('#editorSave');
    btn.disabled = true; btn.textContent = 'שומר…';
    try {
      if (editing) await db.updateProduct(editing.id, row);
      else await db.createProduct(row);
      await loadProducts();
      closeEditor();
      toast(editing ? 'המנה עודכנה' : 'המנה נוספה', 'ok');
    } catch (ex) {
      err.hidden = false;
      err.textContent = friendly(ex);
    } finally { btn.disabled = false; btn.textContent = 'שמירה'; }
  });

  $('#deleteProduct').addEventListener('click', async () => {
    if (!editing) return;
    if (!await askConfirm('מחיקת מנה', 'למחוק את "' + editing.name + '"? אי אפשר לבטל.')) return;
    try {
      await db.deleteProduct(editing.id);
      await loadProducts();
      closeEditor();
      toast('המנה נמחקה', 'ok');
    } catch (ex) { toast('המחיקה נכשלה: ' + friendly(ex), 'err'); }
  });

  /* ---------- settings ---------- */
  $('#settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#saveSettings');
    btn.disabled = true; btn.textContent = 'שומר…';
    try {
      await db.updateSettings({
        business_name: $('#s_business_name').value.trim(),
        phone: $('#s_phone').value.trim(),
        whatsapp: $('#s_whatsapp').value.trim(),
        address: $('#s_address').value.trim(),
        accepting_orders: $('#s_accepting_orders').checked,
        notice: $('#s_notice').value.trim()
      });
      toast('ההגדרות נשמרו', 'ok');
    } catch (ex) { toast('השמירה נכשלה: ' + friendly(ex), 'err'); }
    finally { btn.disabled = false; btn.textContent = 'שמירה'; }
  });

  /* turn a database error into something the owner can act on */
  function friendly(ex) {
    const m = String((ex && ex.message) || '');
    if (ex && ex.status === 401) return 'תוקף ההתחברות פג. צריך להתחבר מחדש.';
    if (ex && ex.status === 403) return 'אין לך הרשאה לפעולה הזו.';
    if (/duplicate key|unique/i.test(m)) return 'כבר קיימת מנה בשם הזה.';
    if (/violates foreign key/i.test(m)) return 'הקטגוריה שנבחרה לא קיימת.';
    if (/price_not_negative|sale_price_not_negative/i.test(m)) return 'מחיר לא יכול להיות שלילי.';
    if (/sale_below_price/i.test(m)) return 'מחיר המבצע גבוה מהמחיר הרגיל.';
    if (/מכילה/.test(m)) return m;
    if (/Failed to fetch|NetworkError/i.test(m)) return 'אין חיבור לשרת.';
    return m || 'שגיאה לא מזוהה.';
  }

  /* an existing session skips the form */
  (async () => {
    if (!db.configured || !db.session) return;
    try {
      const who = await db.whoAmI();
      if (who) { me = who; await enterPanel(); }
    } catch (e) { /* expired: the form stays */ }
  })();
})();
