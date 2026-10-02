/* ============================================================================
   Live menu.

   The menu in index.html stays exactly as it is and is what every visitor sees
   first. This file only replaces it once the database has answered with a menu
   that is actually usable. If the database is not configured, is unreachable,
   is slow, or returns nothing, the page keeps the static menu and nobody sees a
   gap. That ordering is deliberate: a restaurant with no menu on screen is a
   worse failure than a menu that is a few minutes stale.
   ========================================================================= */
(() => {
  'use strict';
  const db = window.SisiDB;
  if (!db || !db.configured) return;

  const grid = document.querySelector('.menu-cats');
  if (!grid) return;

  const text = (tag, cls, s) => { const n = document.createElement(tag);
    if (cls) n.className = cls; if (s != null) n.textContent = s; return n; };

  function dishRow(p) {
    const li = document.createElement('li');
    li.className = 'dish-row glow-card';
    li.dataset.cat = p.category;
    li.dataset.tags = (p.tags || []).join('|');   // the filter splits on | , as the static markup does
    li.dataset.search = [p.name, p.description, (p.tags || []).join(' ')].filter(Boolean).join('. ');

    const head = text('div', 'dish-head');
    head.appendChild(text('span', 'dish-title', p.name));
    const leader = text('span', 'leader'); leader.setAttribute('aria-hidden', 'true');
    head.appendChild(leader);

    const onSale = p.sale_price != null && p.price != null;
    const price = text('span', 'dish-price');
    if (p.price == null) price.textContent = 'בטלפון';
    else if (onSale) {
      const was = text('del', null, Number(p.price) + ' ₪');
      price.append(was, document.createTextNode(' ' + Number(p.sale_price) + ' ₪'));
    } else price.textContent = Number(p.price) + ' ₪';
    head.appendChild(price);
    li.appendChild(head);

    if (p.description) li.appendChild(text('p', 'dish-note', p.description));

    const foot = text('div', 'dish-foot');
    const tags = text('p', 'dish-tags');
    (p.tags || []).forEach(t => {
      const cls = t === 'מכיל בשר' ? 'tag tag-meat'
                : t === 'פופולארי' ? 'tag tag-top' : 'tag';
      tags.appendChild(text('span', cls, t));
    });
    if (onSale) tags.appendChild(text('span', 'tag tag-top', 'מבצע'));
    foot.appendChild(tags);

    if (p.available) {
      const add = text('button', 'add-btn');
      add.type = 'button';
      add.dataset.add = p.name;
      add.dataset.price = p.price == null ? 'בטלפון'
        : (onSale ? Number(p.sale_price) : Number(p.price)) + ' ₪';
      const plus = text('span', null, '+'); plus.setAttribute('aria-hidden', 'true');
      add.append(plus, document.createTextNode(' הוספה'));
      foot.appendChild(add);
    } else {
      li.classList.add('sold-out');
      foot.appendChild(text('span', 'sold-out-flag', 'אזל מהמלאי'));
    }
    li.appendChild(foot);
    return li;
  }

  function render(cats, items) {
    const frag = document.createDocumentFragment();
    cats.forEach(c => {
      const mine = items.filter(p => p.category === c.name);
      if (!mine.length) return;
      const sec = document.createElement('div');
      sec.className = 'menu-cat' + (mine.length > 6 ? ' menu-cat-wide' : '');
      sec.appendChild(text('h3', 'cat-title', c.name));
      const ul = text('ul', 'dish-list');
      mine.forEach(p => ul.appendChild(dishRow(p)));
      sec.appendChild(ul);
      frag.appendChild(sec);
    });
    if (!frag.childNodes.length) return false;      // nothing usable: keep the static menu
    grid.textContent = '';
    grid.appendChild(frag);
    return true;
  }

  (async () => {
    try {
      const [cats, items, settings] = await Promise.all([
        db.listCategories(),
        db.listProducts(),
        db.getSettings().catch(() => null)
      ]);
      const live = (items || []).filter(p => !p.hidden);
      const visibleCats = (cats || []).filter(c => !c.hidden);
      if (!live.length || !visibleCats.length) return;

      if (!render(visibleCats, live)) return;
      // the menu DOM changed, so the search, the filters and the basket have to
      // be rebound to it
      document.dispatchEvent(new CustomEvent('sisi:menu-replaced'));

      if (settings && settings.notice) {
        const note = document.querySelector('.menu-note');
        if (note) note.textContent = settings.notice;
      }
      if (settings && settings.accepting_orders === false) {
        document.body.classList.add('orders-paused');
      }
    } catch (e) {
      /* the static menu is already on screen and stays there */
    }
  })();
})();
