(() => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!token || !user) { window.location.href = 'index.html'; return; }

  const isAdmin = user.role === 'admin';
  let currentSection = 'dashboard';
  let allProducts = [];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  async function api(url, opts = {}) {
    const headers = { 'Authorization': `Bearer ${token}`, ...opts.headers };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) { localStorage.clear(); window.location.href = 'index.html'; }
    if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Error' })); throw new Error(err.error || 'Error'); }
    if (res.headers.get('content-type')?.includes('application/pdf') || res.headers.get('content-type')?.includes('spreadsheetml')) return res.blob();
    return res.json();
  }

  const money = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    $('#toastContainer').appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
  }

  function openModal(title, bodyHtml, wide = false) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modal').classList.toggle('modal-wide', wide);
    $('#modalOverlay').style.display = 'flex';
  }
  function closeModal() { $('#modalOverlay').style.display = 'none'; }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', (e) => { if (e.target === $('#modalOverlay')) closeModal(); });

  $('#userInfo').innerHTML = `<span class="user-name">${user.username}</span><span class="user-role">${user.role === 'admin' ? 'Administrador' : 'Consulta'}</span>`;
  if (!isAdmin) $('#navUsers').style.display = 'none';
  $('#btnLogout').addEventListener('click', () => { localStorage.clear(); window.location.href = 'index.html'; });

  // ===== Menú móvil (drawer hamburguesa) =====
  const sidebarEl = $('#sidebar');
  const overlayEl = $('#sidebarOverlay');
  const setMenu = (open) => {
    if (!sidebarEl) return;
    sidebarEl.classList.toggle('menu-open', open);
    if (overlayEl) overlayEl.style.display = open ? 'block' : 'none';
    document.body.classList.toggle('no-scroll', open);
  };
  const toggleBtn = $('#menuToggle');
  if (toggleBtn) toggleBtn.addEventListener('click', () => setMenu(!sidebarEl.classList.contains('menu-open')));
  if (overlayEl) overlayEl.addEventListener('click', () => setMenu(false));
  $$('.nav-item').forEach(n => n.addEventListener('click', () => setMenu(false)));

  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchSection(item.dataset.section);
    });
  });

  function switchSection(section) {
    currentSection = section;
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === section));
    $$('.section').forEach(s => s.style.display = 'none');
    $(`#section-${section}`).style.display = 'block';
    loadSection(section);
  }

  async function loadProducts() {
    try { allProducts = await api('/api/products'); } catch { allProducts = []; }
    return allProducts;
  }

  function prodName(id) { const p = allProducts.find(x => x.id === id); return p ? p.name : ''; }

  async function loadSection(section) {
    switch (section) {
      case 'dashboard': renderDashboard(); break;
      case 'registro': renderRegistro(); break;
      case 'inventario': renderInventario(); break;
      case 'productos': renderProductos(); break;
      case 'historial': renderHistorial(); break;
      case 'informes': renderInformes(); break;
      case 'users': renderUsers(); break;
    }
  }

  // ==================== DASHBOARD ====================
  async function renderDashboard() {
    const s = $('#section-dashboard');
    const demoPanelHTML = isAdmin ? `
      <div class="panel demo-panel" style="margin-top:1.5rem;">
        <h3>🧪 Datos de prueba</h3>
        <p class="text-muted">Carga un inventario ficticio de cafetería para probar la app: dos ciclos ya cerrados (uno con ganancia y otro con ligera pérdida) más un ciclo abierto, con movimientos introducidos poco a poco a lo largo de varios días.</p>
        <div class="quick-row">
          <button class="btn btn-primary" id="btnDemoLoad">Cargar datos de prueba</button>
          <button class="btn btn-secondary btn-danger" id="btnDemoClear">Eliminar datos de prueba</button>
        </div>
        <div id="demoResult" class="demo-result"></div>
      </div>` : '';

    const bindDemoButtons = () => {
      if (!isAdmin) return;
      const loadBtn = $('#btnDemoLoad');
      const clearBtn = $('#btnDemoClear');
      const resultEl = $('#demoResult');
      if (loadBtn) loadBtn.addEventListener('click', async () => {
        if (!confirm('Esto reemplazará TODOS los datos actuales de la app (productos, ciclos y registros) por datos de prueba ficticios. ¿Continuar?')) return;
        try {
          loadBtn.disabled = true;
          const r = await api('/api/demo/load', { method: 'POST' });
          if (resultEl) resultEl.innerHTML = `<span class="text-positive">✔ ${r.message}: ${r.products} productos, ${r.entries} registros, ${r.cycles} ciclos. Ciclo de prueba con ganancia: ${money(r.ganancia.netProfit)} · Ciclo con pérdida: ${money(r.perdida.netProfit)}.</span>`;
          setTimeout(() => renderDashboard(), 600);
        } catch (err) { toast(err.message, 'error'); }
        finally { loadBtn.disabled = false; }
      });
      if (clearBtn) clearBtn.addEventListener('click', async () => {
        if (!confirm('Esto eliminará todos los productos, ciclos y registros actuales. ¿Continuar?')) return;
        try {
          clearBtn.disabled = true;
          const r = await api('/api/demo/clear', { method: 'POST' });
          toast(r.message);
          setTimeout(() => renderDashboard(), 500);
        } catch (err) { toast(err.message, 'error'); }
        finally { clearBtn.disabled = false; }
      });
    };

    s.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      const data = await api('/api/dashboard');
      if (!data.openCycle) {
        s.innerHTML = `
          <div class="page-header"><h1>Dashboard</h1></div>
          <div class="no-cycle">
            <div class="no-cycle-icon"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg></div>
            <h2>No hay ciclo de inventario activo</h2>
            <p>Para comenzar, abre un nuevo ciclo de inventario.</p>
            ${isAdmin ? '<button class="btn btn-primary" id="btnOpenCycle">+ Abrir Ciclo de Inventario</button>' : '<p class="text-muted">Contacta al administrador para abrir un ciclo.</p>'}
          </div>
          <div class="history-short">
            <h3>Ciclos cerrados: ${data.closedCycles}</h3>
          </div>
          ${demoPanelHTML}
        `;
        if (isAdmin) $('#btnOpenCycle').addEventListener('click', openCycleModal);
        bindDemoButtons();
        return;
      }

      const c = data.openCycle;
      const profit = c.totalSales - c.totalPurchases;
      const net = c.totalSales - c.totalPurchases - c.totalLosses;
      const profitPct = c.totalSales ? (profit / c.totalSales * 100) : 0;

      s.innerHTML = `
        <div class="page-header">
          <h1>Dashboard</h1>
          <div class="cycle-badge">Ciclo abierto desde el <strong>${c.startDate}</strong></div>
        </div>
        <div class="cards-grid">
          <div class="card card-blue">
            <div class="card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg></div>
            <div class="card-info"><span class="card-value">${money(c.totalPurchases)}</span><span class="card-label">Compras</span></div>
          </div>
          <div class="card card-green">
            <div class="card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div>
            <div class="card-info"><span class="card-value">${money(c.totalSales)}</span><span class="card-label">Ventas</span></div>
          </div>
          <div class="card card-red">
            <div class="card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
            <div class="card-info"><span class="card-value">${money(c.totalLosses)}</span><span class="card-label">Pérdidas</span></div>
          </div>
          <div class="card ${net >= 0 ? 'card-green' : 'card-red'}">
            <div class="card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg></div>
            <div class="card-info"><span class="card-value">${money(net)}</span><span class="card-label">Ganancia Neta</span></div>
          </div>
        </div>

        <div class="panel dashboard-grid">
          <div class="chart-box">
            <h3>Últimos Registros</h3>
            <table class="data-table small">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Valor</th></tr></thead>
              <tbody>
                ${data.totals.entries.length ? data.totals.entries.map(e => {
                  const typeName = { purchase: 'Compra', sale: 'Venta', loss: 'Pérdida' }[e.type] || e.type;
                  const typeClass = { purchase: 'badge-purchase', sale: 'badge-sale', loss: 'badge-loss' }[e.type] || '';
                  const amount = e.type === 'sale' ? e.totalSale : e.totalCost;
                  const label = (e.type === 'sale' && e.isDaySale) ? 'Venta del día' : typeName;
                  return `<tr><td>${e.date}</td><td><span class="mini-badge ${typeClass}">${label}</span></td><td>${e.isDaySale ? '<em>Efectivo</em>' : (e.description || prodName(e.productId) || '-')}</td><td>${money(amount)}</td></tr>`;
                }).join('') : '<tr><td colspan="4" class="empty-state">Sin registros aún</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="chart-box">
            <h3>Distribución del Ciclo</h3>
            <canvas id="dashboardPie" height="200"></canvas>
          </div>
        </div>

        <div class="panel" style="margin-top:1.5rem;">
          <h3>Resumen del Ciclo</h3>
          <div class="summary-grid">
            <div class="summary-item"><span class="s-label">Ganancia estimada</span><span class="s-value">${money(profit)}</span><span class="s-sub">${profitPct.toFixed(1)}% sobre ventas</span></div>
            <div class="summary-item"><span class="s-label">Ingresos del ciclos</span><span class="s-value">${money(c.totalSales)}</span></div>
            <div class="summary-item"><span class="s-label">Costo de compras</span><span class="s-value">${money(c.totalPurchases)}</span></div>
            <div class="summary-item"><span class="s-label">Pérdidas acumuladas</span><span class="s-value">${money(c.totalLosses)}</span></div>
          </div>
          ${isAdmin ? `<div style="margin-top:1rem;"><button class="btn btn-primary" id="btnGotoInventario">Ir al Inventario / Cerrar Ciclo</button></div>` : ''}
        </div>
        ${demoPanelHTML}
      `;
      if (isAdmin) $('#btnGotoInventario').addEventListener('click', () => switchSection('inventario'));
      bindDemoButtons();

      if (data.totals.entries.length) {
        const ctx = $('#dashboardPie');
        if (ctx && window.Chart) {
          new Chart(ctx, {
            type: 'pie',
            data: {
              labels: ['Compras', 'Ventas', 'Pérdidas'],
              datasets: [{
                data: [c.totalPurchases, c.totalSales, c.totalLosses],
                backgroundColor: ['#3498db', '#27ae60', '#e74c3c']
              }]
            },
            options: { plugins: { legend: { position: 'bottom' } } }
          });
        }
      }
    } catch (err) { s.innerHTML = `<div class="error-msg">${err.message}</div>`; }
  }

  function openCycleModal() {
    openModal('Abrir Ciclo de Inventario', `
      <div class="info-box">Un ciclo empieza con el inventario dejado del ciclo anterior. Lleva el registro de compras, ventas y pérdidas hasta que hagas el siguiente conteo.</div>
      <form id="cycleForm" class="modal-form">
        <div class="form-group"><label>Fecha de inicio del ciclo</label><input type="date" id="cycleStart" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Inventario inicial (valor dejado del ciclo anterior, opcional)</label><input type="number" id="cycleOpening" placeholder="0.00" min="0" step="0.01"></div>
        <div class="form-group"><label>Notas</label><textarea id="cycleNotes" rows="2" placeholder="Opcional"></textarea></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Abrir Ciclo</button>
        </div>
      </form>
    `);
    $('#cycleForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/cycles/open', { method: 'POST', body: {
          startDate: $('#cycleStart').value,
          openingInventory: Number($('#cycleOpening').value) || 0,
          notes: $('#cycleNotes').value
        } });
        closeModal();
        toast('Ciclo abierto. ¡A registrar!');
        switchSection('registro');
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  window.openCycleModal = openCycleModal;

  // ==================== REGISTRO ====================
  async function renderRegistro() {
    const s = $('#section-registro');
    s.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      await loadProducts();
      let cycle;
      try { cycle = await api('/api/cycles/current'); } catch { cycle = null; }

      if (!cycle) {
        s.innerHTML = `
          <div class="page-header"><h1>Registro Diario</h1></div>
          <div class="no-cycle">
            <h2>No hay ciclo abierto</h2>
            <p>Primero abre un ciclo de inventario para poder registrar compras, ventas y pérdidas.</p>
            ${isAdmin ? '<button class="btn btn-primary" id="btnOpenCycle2">+ Abrir Ciclo</button>' : '<p class="text-muted">Contacta al administrador.</p>'}
          </div>
        `;
        if (isAdmin) $('#btnOpenCycle2').addEventListener('click', openCycleModal);
        return;
      }

      const entries = await api(`/api/entries?cycleId=${cycle.id}`);
      const todayEntries = entries.filter(e => e.date === new Date().toISOString().split('T')[0]);

      s.innerHTML = `
        <div class="page-header">
          <h1>Registro Diario</h1>
          <div class="cycle-badge">Ciclo desde <strong>${cycle.startDate}</strong></div>
        </div>
        <div class="entry-form panel">
          <h3>Anotar entrada (como en tu cuaderno)</h3>
          <div class="quick-row">
            <div class="form-group flex-2">
              <label>Producto o descripción</label>
<input type="text" id="entSearch" placeholder="Escribe o elige un producto" autocomplete="off">
            </div>
            <div class="form-group">
              <label>Tipo</label>
              <select id="entType">
                <option value="purchase">Compra</option>
                <option value="sale">Venta</option>
                <option value="day_sale">Venta del día (caja)</option>
                <option value="loss">Pérdida</option>
              </select>
            </div>
            <div class="form-group" id="entQtyWrap">
              <label>Cantidad</label>
              <input type="number" id="entQty" min="0" step="any" placeholder="opcional">
            </div>
            <div class="form-group" id="entAmountWrap">
              <label id="entAmountLabel">Valor</label>
              <input type="number" id="entAmount" min="0" step="0.01" placeholder="0.00">
            </div>
          </div>
          <div class="quick-row" id="daySaleRow" style="display:none;">
            <div class="form-group">
              <label>Fondo inicial de caja (efectivo con que comenzó)</label>
              <input type="number" id="entDayStart" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group">
              <label>Efectivo al final del día (en caja)</label>
              <input type="number" id="entDayEnd" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group" style="align-self:flex-end;">
              <button type="button" class="btn btn-secondary" id="btnCalcularDia">Calcular venta</button>
              <span class="day-sale-result" id="daySaleResult"></span>
            </div>
          </div>
          <div class="quick-row" id="lossRow" style="display:none;">
            <div class="form-group flex-2"><label>Motivo de la pérdida</label><input type="text" id="entLossReason" placeholder="ej. se echó a perder, se venció..."></div>
            <div class="form-group"><label>¿Factura?</label><select id="entInvoice"><option value="0">No</option><option value="1">Sí</option></select></div>
            <div class="form-group"><label>Fecha</label><input type="date" id="entDate" value="${new Date().toISOString().split('T')[0]}"></div>
          </div>
          <div class="quick-actions">
            <button class="btn btn-primary" id="btnAddEntry">+ Agregar entrada</button>
            <button class="btn btn-secondary" id="btnAddAnother" title="Agrega y mantiene el formulario para seguir anotando">+ Agregar y seguir anotando</button>
          </div>
        </div>

        <div class="panel" style="margin-top:1.5rem;">
          <div class="panel-header">
            <h3>Registros de hoy (${todayEntries.length})</h3>
            <input type="date" id="entFilterDate" class="compact-input" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="table-container">
            <table class="data-table small">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Producto / Detalle</th><th>Cant.</th><th>Valor</th>${isAdmin ? '<th>Acciones</th>' : ''}</tr></thead>
              <tbody id="entBody"></tbody>
            </table>
          </div>
          <div class="day-summary" id="daySummary"></div>
        </div>
      `;

      $('#entType').addEventListener('change', () => {
        const t = $('#entType').value;
        const isDay = t === 'day_sale';
        const isLoss = t === 'loss';
        // Venta del día: ocultar producto/cantidad/valor, mostrar caja final e inicial
        const searchWrap = $('#entSearch').closest('.form-group');
        searchWrap.style.display = isDay ? 'none' : '';
        $('#entQtyWrap').style.display = isDay ? 'none' : '';
        $('#entAmountWrap').style.display = isDay ? 'none' : '';
        $('#lossRow').style.display = isLoss ? 'flex' : 'none';
        $('#daySaleRow').style.display = isDay ? 'flex' : 'none';
        $('#entAmountLabel').textContent = t === 'sale' ? 'Valor de venta' : t === 'purchase' ? 'Valor de compra' : t === 'loss' ? 'Valor de la pérdida' : 'Valor';
        $('#entAmount').placeholder = t === 'sale' ? 'Valor de venta' : 'Costo';
      });

      let daySaleCalc = 0;
      $('#btnCalcularDia').addEventListener('click', () => {
        const inicio = Number($('#entDayStart').value) || 0;
        const final = Number($('#entDayEnd').value) || 0;
        daySaleCalc = Math.max(0, final - inicio);
        $('#daySaleResult').textContent = daySaleCalc > 0 ? `Venta del día: ${money(daySaleCalc)}` : (final === 0 && inicio === 0 ? '' : 'La caja no cerró con ganancia');
      });
      // Calcular en cuanto se teclea
      $('#entDayEnd').addEventListener('input', () => $('#btnCalcularDia').click());
      $('#entFilterDate').addEventListener('change', () => renderEntries(cycle, $('#entFilterDate').value));
      renderEntries(cycle, new Date().toISOString().split('T')[0]);

      // ===== Autocompletado en vivo para el producto de la entrada =====
      const entSearch = $('#entSearch');
      const entAcBox = document.createElement('div');
      entAcBox.className = 'ac-box';
      entAcBox.style.display = 'none';
      entSearch.parentNode.appendChild(entAcBox);
      const entNormalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
      const entActive = allProducts.filter(p => p.active);
      let entAcItems = [], entAcIndex = -1;

      const entShowAc = (list, anchor) => {
        entAcItems = list; entAcIndex = -1;
        if (!list.length || !anchor) { entAcBox.style.display = 'none'; return; }
        entAcBox.innerHTML = list.map((p, i) => `
          <div class="ac-item" data-idx="${i}">
            <span class="ac-name">${p.name}</span>
            <span class="ac-meta">${p.category === 'perecedero' ? 'perecedero' : p.category === 'no_perecedero' ? 'no perecedero' : p.category || ''}${p.unit ? ' · ' + p.unit : ''}</span>
          </div>`).join('');
        entAcBox.querySelectorAll('.ac-item').forEach((el, i) => {
          el.addEventListener('click', () => entSelect(i));
          el.addEventListener('mousemove', () => { entAcIndex = i; entRenderAc(); });
        });
        entRenderAc();
        const rect = anchor.getBoundingClientRect();
        entAcBox.style.left = rect.left + 'px';
        entAcBox.style.top = (rect.bottom + window.scrollY) + 'px';
        entAcBox.style.width = rect.width + 'px';
        entAcBox.style.display = 'block';
      };
      const entRenderAc = () => {
        entAcBox.querySelectorAll('.ac-item').forEach(el => el.classList.toggle('active', Number(el.dataset.idx) === entAcIndex));
        const active = entAcBox.querySelector('.ac-item.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
      };
      const entSelect = (i) => {
        if (entAcItems[i]) { entSearch.value = entAcItems[i].name; entAcBox.style.display = 'none'; entSearch.focus(); }
      };
      entSearch.addEventListener('input', () => {
        const t = entNormalize(entSearch.value);
        if (!t) { entShowAc([], null); return; }
        entShowAc([...entActive.filter(p => entNormalize(p.name).startsWith(t)), ...entActive.filter(p => entNormalize(p.name).includes(t) && !entNormalize(p.name).startsWith(t))].slice(0, 10), entSearch);
      });
      entSearch.addEventListener('keydown', (e) => {
        const acOpen = entAcBox.style.display !== 'none' && entAcItems.length > 0;
        if ((e.key === 'Tab' || e.key === 'ArrowDown') && acOpen) { e.preventDefault(); entAcIndex = (entAcIndex + 1) % entAcItems.length; entRenderAc(); return; }
        if (e.key === 'ArrowUp' && acOpen) { e.preventDefault(); entAcIndex = (entAcIndex - 1 + entAcItems.length) % entAcItems.length; entRenderAc(); return; }
        if (e.key === 'Escape' && acOpen) { e.preventDefault(); entAcBox.style.display = 'none'; return; }
        if (e.key === 'Enter' && acOpen) { e.preventDefault(); if (entAcIndex >= 0) entSelect(entAcIndex); else entSelect(0); return; }
      });
      document.addEventListener('click', (e) => {
        if (!entAcBox.contains(e.target) && e.target !== entSearch && e.target.id !== 'entQty' && e.target.id !== 'entAmount' && e.target.id !== 'btnAddEntry' && e.target.id !== 'btnAddAnother') entAcBox.style.display = 'none';
      });

      $('#btnAddEntry').addEventListener('click', () => submitEntry(cycle, false));
      $('#btnAddAnother').addEventListener('click', () => submitEntry(cycle, true));
    } catch (err) { s.innerHTML = `<div class="error-msg">${err.message}</div>`; }
  }

  function renderEntries(cycle, date) {
    const tbody = $('#entBody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Cargando...</td></tr>';
    api(`/api/entries?cycleId=${cycle.id}&date=${date}`).then(entries => {
      if (!tbody) return;
      const typeName = { purchase: 'Compra', sale: 'Venta', loss: 'Pérdida' };
      const typeClass = { purchase: 'badge-purchase', sale: 'badge-sale', loss: 'badge-loss' };
      tbody.innerHTML = entries.length ? entries.map(e => {
        const amount = e.type === 'sale' ? e.totalSale : e.totalCost;
        const label = (e.type === 'sale' && e.isDaySale) ? 'Venta del día' : (typeName[e.type] || e.type);
        return `<tr>
          <td>${e.date}</td>
          <td><span class="mini-badge ${typeClass[e.type]}">${label}</span></td>
          <td>${e.isDaySale ? '<em>Efectivo (caja final − fondo)</em>' : (e.description || prodName(e.productId) || '-')}${e.hasInvoice ? ' <span class="invoice-icon" title="Con factura">🧾</span>' : ''}</td>
          <td>${e.quantity && !e.isDaySale ? e.quantity : '-'}</td>
          <td>${money(amount)}</td>
          ${isAdmin ? `<td class="actions-cell">
            <button class="btn-icon btn-edit" onclick="appEditEntry('${e.id}')" title="Editar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn-icon btn-delete" onclick="appDeleteEntry('${e.id}')" title="Eliminar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
          </td>` : ''}
        </tr>`;
      }).join('') : '<tr><td colspan="6" class="empty-state">Sin registros este día</td></tr>';

      const sums = entries.reduce((acc, e) => {
        if (e.type === 'purchase') acc.purchase += e.totalCost || 0;
        else if (e.type === 'sale') acc.sale += e.totalSale || 0;
        else if (e.type === 'loss') acc.loss += e.totalCost || 0;
        return acc;
      }, { purchase: 0, sale: 0, loss: 0 });

      $('#daySummary').innerHTML = entries.length ? `
        <span>💵 Compras: <strong>${money(sums.purchase)}</strong></span>
        <span>💰 Ventas: <strong>${money(sums.sale)}</strong></span>
        <span>📉 Pérdidas: <strong>${money(sums.loss)}</strong></span>
        <span>Balance: <strong class="${(sums.sale - sums.purchase - sums.loss) >= 0 ? 'text-positive' : 'text-negative'}">${money(sums.sale - sums.purchase - sums.loss)}</strong></span>
      ` : '';
    }).catch(() => { if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error cargando</td></tr>'; });
  }

  async function submitEntry(cycle, keepForm) {
    const type = $('#entType').value;
    const isDaySale = type === 'day_sale';

    if (isDaySale) {
      // Venta del día (caja): registra solo el efectivo recaudado en el día
      if (!daySaleCalc || daySaleCalc <= 0) { toast('Calcula la venta del día primero (efectivo final − fondo inicial)', 'error'); return; }
      const body = {
        date: $('#entFilterDate') ? $('#entFilterDate').value || $('#entDate').value : $('#entDate').value,
        type: 'sale',
        isDaySale: true,
        productId: '',
        description: 'Venta del día (caja)',
        quantity: 0,
        unit: '',
        totalCost: 0,
        totalSale: daySaleCalc,
        lossReason: '',
        hasInvoice: false
      };
      try {
        await api('/api/entries', { method: 'POST', body });
        if (keepForm) {
          $('#entDayStart').value = ''; $('#entDayEnd').value = '';
          $('#daySaleResult').textContent = ''; daySaleCalc = 0;
          toast('Venta del día agregada. Sigue anotando.');
        } else {
          toast('Venta del día agregada');
          closeModal();
        }
        renderEntries(cycle, $('#entFilterDate') ? $('#entFilterDate').value : $('#entDate').value);
      } catch (err) { toast(err.message, 'error'); }
      return;
    }

    const searchVal = $('#entSearch').value.trim();
    if (!searchVal) { toast(isDaySale ? 'Escribe la venta del día' : 'Escribe qué se compró/vendió/perdió', 'error'); return; }

    const product = allProducts.find(p => p.name.toLowerCase() === searchVal.toLowerCase());
    const amount = Number($('#entAmount').value) || 0;
    const qty = Number($('#entQty').value) || 0;

    let body = {
      date: $('#entFilterDate') ? $('#entFilterDate').value || $('#entDate').value : $('#entDate').value,
      type,
      productId: product ? product.id : '',
      description: product ? '' : searchVal,
      quantity: qty,
      unit: product ? product.unit : '',
      totalCost: type !== 'sale' ? amount : (product ? product.avgCost * qty : 0),
      totalSale: type === 'sale' ? amount : 0,
      lossReason: type === 'loss' ? $('#entLossReason').value : '',
      hasInvoice: $('#entInvoice') ? $('#entInvoice').value === '1' : false
    };

    // Si en venta no hay producto y solo dio valor, registrar el valor como venta
    if (type === 'sale' && !product && !qty) {
      body.description = searchVal;
      body.totalSale = amount;
      body.quantity = 0;
    }
    if (type === 'loss' && !body.totalCost) body.totalCost = amount;

    try {
      await api('/api/entries', { method: 'POST', body });
      if (keepForm) {
        $('#entSearch').value = '';
        $('#entQty').value = '';
        $('#entAmount').value = '';
        $('#entLossReason').value = '';
        toast('Entrada agregada. Sigue anotando.');
      } else {
        toast('Entrada agregada');
        closeModal();
      }
      renderEntries(cycle, $('#entFilterDate') ? $('#entFilterDate').value : $('#entDate').value);
    } catch (err) { toast(err.message, 'error'); }
  }

  window.appEditEntry = async function(id) {
    const entries = await api('/api/entries');
    const e = entries.find(x => x.id === id);
    if (!e) return;
    openModal('Editar Entrada', `
      <form id="entryEditForm" class="modal-form">
        <div class="form-row">
          <div class="form-group"><label>Fecha</label><input type="date" id="eeDate" value="${e.date}"></div>
          <div class="form-group"><label>Tipo</label><select id="eeType">
            <option value="purchase" ${e.type === 'purchase' ? 'selected' : ''}>Compra</option>
            <option value="sale" ${e.type === 'sale' ? 'selected' : ''}>Venta</option>
            <option value="loss" ${e.type === 'loss' ? 'selected' : ''}>Pérdida</option>
          </select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Producto / Detalle</label><input type="text" id="eeDesc" value="${e.description || prodName(e.productId) || ''}"></div>
          <div class="form-group"><label>Cantidad</label><input type="number" id="eeQty" value="${e.quantity || 0}" step="any"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Valor compra</label><input type="number" id="eeCost" value="${e.totalCost || 0}" step="0.01"></div>
          <div class="form-group"><label>Valor venta</label><input type="number" id="eeSale" value="${e.totalSale || 0}" step="0.01"></div>
        </div>
        <div class="form-group"><label>Motivo pérdida</label><input type="text" id="eeReason" value="${e.lossReason || ''}"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    `);
    $('#entryEditForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api(`/api/entries/${id}`, { method: 'PUT', body: {
          date: $('#eeDate').value, type: $('#eeType').value,
          description: $('#eeDesc').value, quantity: Number($('#eeQty').value),
          totalCost: Number($('#eeCost').value), totalSale: Number($('#eeSale').value),
          lossReason: $('#eeReason').value
        } });
        closeModal();
        toast('Entrada actualizada');
        renderRegistro();
      } catch (err) { toast(err.message, 'error'); }
    });
  };

  window.appDeleteEntry = async function(id) {
    if (!confirm('¿Eliminar esta entrada?')) return;
    try {
      await api(`/api/entries/${id}`, { method: 'DELETE' });
      toast('Entrada eliminada');
      renderRegistro();
    } catch (err) { toast(err.message, 'error'); }
  };

  // ==================== INVENTARIO (CONTEO RÁPIDO Y CIERRE) ====================
  async function renderInventario() {
    const s = $('#section-inventario');
    s.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      await loadProducts();
      let cycle;
      try { cycle = await api('/api/cycles/current'); } catch { cycle = null; }

      if (!cycle) {
        s.innerHTML = `
          <div class="page-header"><h1>Inventario</h1></div>
          <div class="no-cycle">
            <h2>No hay ciclo abierto</h2>
            <p>No puedes hacer un conteo sin un ciclo de inventario abierto.</p>
            ${isAdmin ? '<button class="btn btn-primary" id="btnOpenCycle3">+ Abrir Ciclo</button>' : '<p class="text-muted">Contacta al administrador.</p>'}
          </div>
        `;
        if (isAdmin) $('#btnOpenCycle3').addEventListener('click', openCycleModal);
        return;
      }

      // Estado del conteo: productId -> cantidad
      // Persistido en localStorage por ciclo (sobrevive recargas/reinicios)
      const CY_KEY = 'countedMap_' + cycle.id;
      let countedMap = {};
      try { countedMap = JSON.parse(localStorage.getItem(CY_KEY) || '{}') || {}; } catch (e) { countedMap = {}; }
      const saveMap = () => { try { localStorage.setItem(CY_KEY, JSON.stringify(countedMap)); } catch (e) {} };

      // Lista de todos los productos activos que se pueden contar (pendientes potenciales)
      const countable = allProducts.filter(p => p.active);

      const unitName = (p) => p && p.unit ? p.unit : '';

      s.innerHTML = `
        <div class="page-header">
          <h1>Inventario Físico</h1>
          <div class="cycle-badge">Ciclo desde <strong>${cycle.startDate}</strong></div>
        </div>

        <div class="capture-panel panel">
          <div class="capture-title">
            <span>🎯 Captura rápida</span>
            <span class="capture-hint">escribe el producto, Enter, la cantidad, Enter</span>
          </div>
          <div class="capture-input-row">
            <input type="text" id="captureInput" class="capture-input" placeholder="Producto (o 'producto cantidad')" autocomplete="off" autofocus>
            <span class="capture-unit" id="captureUnit"></span>
          </div>
          <div class="capture-message" id="captureMsg"></div>
        </div>

        <div class="count-columns">
          <div class="count-col col-pending">
            <div class="col-header red">
              <span>Pendientes por contar</span>
              <span class="col-badge" id="pendingCount">0</span>
            </div>
            <div class="col-body" id="pendingList"></div>
          </div>
          <div class="count-col col-done">
            <div class="col-header green">
              <span>Contados</span>
              <span class="col-total" id="doneTotal">$0.00</span>
            </div>
            <div class="col-body" id="doneList"></div>
          </div>
        </div>

        <div class="panel" style="margin-top:1.5rem;">
          <h3>Resumen antes de cerrar</h3>
          <div class="summary-grid">
            <div class="summary-item"><span class="s-label">Compras del ciclo</span><span class="s-value">${money(cycle.totalPurchases)}</span></div>
            <div class="summary-item"><span class="s-label">Ventas del ciclo</span><span class="s-value">${money(cycle.totalSales)}</span></div>
            <div class="summary-item"><span class="s-label">Pérdidas del ciclo</span><span class="s-value">${money(cycle.totalLosses)}</span></div>
            <div class="summary-item"><span class="s-label">Inventario anterior</span><span class="s-value">${money(cycle.openingInventory)}</span></div>
          </div>
          <div class="summary-grid">
            <div class="summary-item"><span class="s-label">Inventario teórico</span><span class="s-value" id="theoInv">${money(cycle.openingInventory + cycle.totalPurchases - cycle.totalSales - cycle.totalLosses)}</span></div>
            <div class="summary-item"><span class="s-label">Inventario contado</span><span class="s-value text-positive" id="countedVal">$0.00</span></div>
            <div class="summary-item"><span class="s-label">Diferencia (teórico - contado)</span><span class="s-value" id="diffVal">$0.00</span></div>
          </div>
          ${isAdmin ? `
          <div class="form-group"><label>Notas del inventario</label><textarea id="cycleCloseNotes" rows="2"></textarea></div>
          <div style="margin-top:1rem;">
            <button class="btn btn-primary btn-danger" id="btnCloseCycle">Cerrar Inventario del Ciclo</button>
            <button class="btn btn-secondary" id="btnCancelClose" style="display:none;">Cancelar cierre</button>
          </div>
          ` : '<p class="text-muted">Solo el administrador puede cerrar el ciclo.</p>'}
        </div>
      `;

      const updateTotals = () => {
        const entries = Object.entries(countedMap).map(([id, qty]) => {
          const p = allProducts.find(x => x.id === id);
          return { id, qty, price: (p && p.avgCost) || 0, name: p ? p.name : 'Producto' };
        });
        const total = entries.reduce((s, e) => s + e.qty * e.price, 0);
        $('#doneTotal').textContent = money(total);
        $('#countedVal').textContent = money(total);
        const theo = cycle.openingInventory + cycle.totalPurchases - cycle.totalSales - cycle.totalLosses;
        const diff = theo - total;
        $('#diffVal').textContent = money(diff);
        $('#diffVal').className = 's-value ' + (diff >= 0 ? 'text-positive' : 'text-negative');
      };

      const renderLists = () => {
        // Verdes (contados)
        const doneEl = $('#doneList');
        const doneIds = Object.keys(countedMap);
        doneEl.innerHTML = doneIds.length ? doneIds.map(id => {
          const p = allProducts.find(x => x.id === id);
          const qty = countedMap[id];
          const name = p ? p.name : 'Producto';
          const unit = p ? (p.unit ? ' ' + p.unit : '') : '';
          const price = (p && p.avgCost) || 0;
          return `<div class="done-item" data-id="${id}">
            <div class="done-info">
              <span class="done-name">${name}</span>
              <span class="done-detail">${qty}${unit} · ${money(qty * price)}</span>
            </div>
            <div class="done-actions">
              <button class="done-edit" onclick="countEdit('${id}')" title="Editar cantidad">✏️</button>
              <button class="done-del" onclick="countDel('${id}')" title="Quitar del conteo">🗑️</button>
            </div>
          </div>`;
        }).join('') : '<div class="empty-state">Vacío. Empieza a contar arriba →</div>';

        // Rojos (pendientes) = activos no contados
        const pendEl = $('#pendingList');
        const pending = countable.filter(p => countedMap[p.id] === undefined);
        const pendingCountEl = $('#pendingCount');
        if (pendingCountEl) pendingCountEl.textContent = String(pending.length);
        pendEl.innerHTML = pending.length ? pending.map(p => `<div class="pending-item">
          <span class="pending-name">${p.name}</span>
          ${p.unit ? `<span class="pending-unit">${p.unit}</span>` : ''}
          <span class="pending-arrow">→</span>
        </div>`).join('') : '<div class="empty-state">✔ Todo contado</div>';

        updateTotals();
      };

      // Normaliza texto: minúsculas + sin acentos + espacios de más
      const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');

      // Buscar producto exacto (por nombre o inicio) — insensible a mayúsculas y acentos
      const findProduct = (text) => {
        const t = normalize(text);
        if (!t) return null;
        let p = allProducts.find(x => normalize(x.name) === t && x.active);
        if (!p) p = allProducts.find(x => normalize(x.name).startsWith(t) && x.active);
        if (!p) p = allProducts.find(x => normalize(x.name).includes(t) && x.active);
        return p || null;
      };

      const msg = (text, type) => {
        const el = $('#captureMsg');
        if (el) { el.textContent = text; el.className = 'capture-message ' + (type || ''); }
      };

      const setUnit = (p) => {
        const el = $('#captureUnit');
        if (el) el.textContent = p ? (unitName(p) || '') : '';
      };

      const submitCapture = (raw) => {
        const text = (raw || '').trim();
        if (!text) return;
        // Formato flexible: "producto 5" → cantidad al final
        let quantity = 0;
        let namePart = text;
        // Primero intenta coincidir el texto completo como nombre de producto
        // (ej: "Vasos #12" termina en número pero es nombre completo)
        let p = findProduct(text);
        if (!p) {
          const parts = text.split(/\s+/);
          const last = parts[parts.length - 1];
          if (/^[+-]?\d+([.,]\d+)?$/.test(last.replace(/,/g, '.'))) {
            quantity = Math.abs(Number(last.replace(',', '.')));
            namePart = parts.slice(0, -1).join(' ');
            p = findProduct(namePart);
          }
        }

        if (p) {
          // Producto existe
          addOrUpdate(p, quantity);
          $('#captureInput').value = '';
          setUnit(null);
          msg('');
          $('#captureInput').focus();
        } else {
          // Producto no existe → preguntar si agregar
          handleUnknown(namePart, quantity);
        }
      };

      const addOrUpdate = (p, quantity) => {
        if (countedMap[p.id] === undefined) {
          countedMap[p.id] = quantity;
          msg(`✔ ${p.name} contado: ${quantity}${unitName(p) ? ' ' + unitName(p) : ''}`, 'ok');
        } else {
          // Ya contado → sumar/restar
          const nuevo = countedMap[p.id] + quantity;
          if (nuevo < 0) { msg(`⚠ No puede quedar negativo. Actual: ${countedMap[p.id]}`, 'warn'); return; }
          countedMap[p.id] = nuevo;
          msg(`↕ ${p.name} ahora: ${nuevo}${unitName(p) ? ' ' + unitName(p) : ''}`, 'warn');
        }
        saveMap();
        renderLists();
      };

      const handleUnknown = (namePart, quantity) => {
        msg(`"${namePart}" no está en la base. ¿Quieres agregarlo?`, 'warn');
        if (confirm(`El producto "${namePart}" no existe.\n¿Deseas agregarlo a la base de datos?`)) {
          openProductModal(null, namePart);
        }
      };

      // ===== Autocompletado en vivo =====
      const acBox = document.createElement('div');
      acBox.className = 'ac-box';
      acBox.style.display = 'none';
      $('#section-inventario').appendChild(acBox);

      let acIndex = -1;
      let acItems = [];

      const showAutocomplete = (list, anchor) => {
        acItems = list;
        acIndex = -1;
        if (!list.length || !anchor) { acBox.style.display = 'none'; return; }
        renderAc();
        const rect = anchor.getBoundingClientRect();
        acBox.style.left = rect.left + 'px';
        acBox.style.top = (rect.bottom + window.scrollY) + 'px';
        acBox.style.width = rect.width + 'px';
        acBox.style.display = 'block';
      };

      const renderAc = () => {
        acBox.innerHTML = acItems.map((p, i) => `
          <div class="ac-item ${i === acIndex ? 'active' : ''}" data-idx="${i}">
            <span class="ac-name">${p.name}</span>
            <span class="ac-meta">${p.category === 'perecedero' ? 'perecedero' : p.category === 'no_perecedero' ? 'no perecedero' : p.category || ''}${p.unit ? ' · ' + p.unit : ''}</span>
          </div>`).join('');
        acBox.querySelectorAll('.ac-item').forEach((el, i) => {
          el.addEventListener('click', () => { selectAc(i); });
          el.addEventListener('mousemove', () => { acIndex = i; renderAc(); });
        });
        // Posicionar el item activo
        if (acItems.length) {
          const active = acBox.querySelector('.ac-item.active');
          if (active) active.scrollIntoView({ block: 'nearest' });
        }
      };

      const selectAc = (i) => {
        if (acItems[i]) {
          $('#captureInput').value = acItems[i].name;
          setUnit(acItems[i]);
          acBox.style.display = 'none';
          msg('Ahora escribe la cantidad y da Enter (o "producto cantidad")', 'info');
          $('#captureInput').focus();
        }
      };

      const input = $('#captureInput');
      input.addEventListener('input', () => {
        const text = input.value.trim();
        if (!text) { showAutocomplete([], null); setUnit(null); return; }
        // Filtrar productos activos por el texto (insensible a mayúsculas y acentos)
        const nt = normalize(text);
        const starts = countable.filter(p => normalize(p.name).startsWith(nt));
        const others = countable.filter(p => normalize(p.name).includes(nt) && !normalize(p.name).startsWith(nt));
        showAutocomplete([...starts, ...others].slice(0, 10), input);
      });

      input.addEventListener('keydown', (e) => {
        const acOpen = acItems.length > 0 && acBox.style.display !== 'none';

        // --- Navegación con Tab / flechas (mueven el sombreado, ciclando) ---
        if (e.key === 'Tab' && acOpen) {
          e.preventDefault();
          acIndex = (acIndex + 1) % acItems.length;
          renderAc();
          return;
        }
        if (e.key === 'ArrowDown' && acOpen) {
          e.preventDefault();
          acIndex = (acIndex + 1) % acItems.length;
          renderAc();
          return;
        }
        if (e.key === 'ArrowUp' && acOpen) {
          e.preventDefault();
          acIndex = (acIndex - 1 + acItems.length) % acItems.length;
          renderAc();
          return;
        }

        // --- Backspace: si hay navegación activa, salir del autocompletado ---
        if (e.key === 'Backspace' && acOpen && acIndex >= 0) {
          e.preventDefault();
          acIndex = -1;
          acBox.style.display = 'none';
          msg('');
          return;
        }

        // --- Escape: cerrar autocompletado ---
        if (e.key === 'Escape' && acOpen) {
          e.preventDefault();
          acIndex = -1;
          acBox.style.display = 'none';
          return;
        }

        // --- Enter: seleccionar la opción sombreada, o continuar con el texto ---
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = input.value.trim();
          // Formato "producto cantidad" → agregar directo (no interferir con autocompletado)
          const esCantidad = /^[\s\S]*\s\d+([.,]\d+)?$/.test(val);
          if (esCantidad) { submitCapture(val); return; }
          // Si hay una opción sombreada, seleccionarla
          if (acOpen && acIndex >= 0 && acItems[acIndex]) {
            selectAc(acIndex);
            return;
          }
          // Si hay opciones pero ninguna sombreada, seleccionar la primera por conveniencia
          if (acOpen && acItems.length) {
            selectAc(0);
            return;
          }
          const p = findProduct(val);
          if (p && !/\s\d/.test(val)) {
            // Solo nombre (y es un producto único) → pide cantidad
            setUnit(p);
            msg(`"${p.name}" · unidad: ${unitName(p) || '—'}. Escribe la cantidad y Enter`, 'info');
            input.value = p.name;
            acBox.style.display = 'none';
          } else {
            submitCapture(val);
          }
        }
      });

      document.addEventListener('click', (e) => {
        if (!acBox.contains(e.target) && e.target !== input) acBox.style.display = 'none';
      });

      // Exponer acciones de la lista verde
      window.countEdit = function(id) {
        const qty = countedMap[id];
        const p = allProducts.find(x => x.id === id);
        const name = p ? p.name : 'Producto';
        const newQty = prompt(`Cantidad de "${name}":`, String(qty));
        if (newQty === null) return;
        const n = Number(newQty.replace(',', '.'));
        if (isNaN(n) || n < 0) { toast('Cantidad inválida', 'error'); return; }
        countedMap[id] = n;
        if (n === 0) delete countedMap[id];
        saveMap();
        renderLists();
      };

      window.countDel = function(id) {
        delete countedMap[id];
        saveMap();
        renderLists();
      };

      // Botón para agregar producto nuevo al conteo desde la lista
      renderLists();

      let closing = false;
      $('#btnCloseCycle').addEventListener('click', () => {
        if (!closing) {
          closing = true;
          $('#btnCloseCycle').textContent = '¿Confirmas cerrar el inventario?';
          $('#btnCancelClose').style.display = 'inline-flex';
          return;
        }
        doCloseInventory(cycle, countedMap);
      });
      $('#btnCancelClose').addEventListener('click', () => {
        closing = false;
        $('#btnCloseCycle').textContent = 'Cerrar Inventario del Ciclo';
        $('#btnCancelClose').style.display = 'none';
      });
    } catch (err) { s.innerHTML = `<div class="error-msg">${err.message}</div>`; }
  }

  async function doCloseInventory(cycle, countedMap) {
    // Se filtran cantidades <= 0 (no contadas)
    const counted = {};
    Object.entries(countedMap).forEach(([id, qty]) => {
      if (qty > 0) counted[id] = qty;
    });

    try {
      const total = Object.values(counted).reduce((s, n) => s + n, 0);
      await api('/api/cycles/close', { method: 'POST', body: {
        countedQuantities: counted,
        closingInventory: total,
        endDate: new Date().toISOString().split('T')[0],
        notes: $('#cycleCloseNotes').value
      } });
      toast('¡Inventario cerrado! La ganancia del ciclo está calculada.');
      try { localStorage.removeItem('countedMap_' + cycle.id); } catch (e) {}
      switchSection('dashboard');
    } catch (err) { toast(err.message, 'error'); }
  }

  // ==================== PRODUCTOS ====================
  async function renderProductos() {
    const s = $('#section-productos');
    s.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      await loadProducts();
      const filterCat = $('#prodFilterCat')?.value || '';
      const search = $('#prodSearch')?.value || '';
      const filtered = allProducts.filter(p =>
        (!filterCat || p.category === filterCat) &&
        (!search || p.name.toLowerCase().includes(search.toLowerCase()))
      );

      s.innerHTML = `
        <div class="page-header">
          <h1>Productos</h1>
          <div class="header-actions">
            <div class="filters">
              <select id="prodFilterCat">
                <option value="">Todas</option>
                <option value="perecedero">Perecederos</option>
                <option value="no_perecedero">No perecederos</option>
              </select>
              <input type="text" id="prodSearch" placeholder="Buscar...">
            </div>
            ${isAdmin ? '<button class="btn btn-primary" id="btnAddProduct">+ Agregar Producto</button>' : ''}
          </div>
        </div>
        <div class="panel">
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>Nombre</th><th>Tipo</th><th>Unidad</th><th>Costo prom.</th><th>Precio venta</th><th>Stock mín.</th><th>Estado</th>${isAdmin ? '<th>Acciones</th>' : ''}</tr></thead>
              <tbody>
                ${filtered.map(p => `<tr>
                  <td>${p.name}</td>
                  <td>${p.category === 'perecedero' ? '<span class="mini-badge badge-perecedero">Perecedero</span>' : p.category === 'no_perecedero' ? '<span class="mini-badge badge-noperec">No perec.</span>' : '—'}</td>
                  <td>${p.unit || '—'}</td>
                  <td>${money(p.avgCost)}</td>
                  <td>${p.salePrice ? money(p.salePrice) : '—'}</td>
                  <td>${p.minStock || '—'}</td>
                  <td>${p.active ? '<span class="mini-badge badge-active">Activo</span>' : '<span class="mini-badge badge-inactive">Inactivo</span>'}</td>
                  ${isAdmin ? `<td class="actions-cell">
                    <button class="btn-icon btn-edit" onclick="appEditProduct('${p.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="btn-icon btn-delete" onclick="appDeleteProduct('${p.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                  </td>` : ''}
                </tr>`).join('')}
              </tbody>
            </table>
            ${filtered.length === 0 ? '<div class="empty-state">No hay productos</div>' : ''}
          </div>
        </div>
      `;
      $('#prodFilterCat').addEventListener('change', renderProductos);
      $('#prodSearch').addEventListener('input', renderProductos);
      if (isAdmin) $('#btnAddProduct').addEventListener('click', () => openProductModal());
    } catch (err) { s.innerHTML = `<div class="error-msg">${err.message}</div>`; }
  }

  function openProductModal(p = null, prefillName = '') {
    const isEdit = !!p;
    const initialName = p ? p.name : prefillName;
    openModal(isEdit ? 'Editar Producto' : 'Agregar Producto', `
      <form id="productForm" class="modal-form">
        <div class="form-group"><label>Nombre *</label><input type="text" id="pName" value="${initialName || ''}" required></div>
        <div class="form-row">
          <div class="form-group"><label>Tipo</label>
            <select id="pCategory">
              <option value="">—</option>
              <option value="perecedero" ${p?.category === 'perecedero' ? 'selected' : ''}>Perecedero</option>
              <option value="no_perecedero" ${p?.category === 'no_perecedero' ? 'selected' : ''}>No perecedero</option>
            </select>
          </div>
          <div class="form-group"><label>Unidad</label>
            <select id="pUnit">
              <option value="">—</option>
              ${['pieza','kg','litro','caja','bolsa','docena','frasco','otra'].map(u => `<option value="${u}" ${p?.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Costo promedio</label><input type="number" id="pCost" value="${p?.avgCost || 0}" step="0.01" min="0"></div>
          <div class="form-group"><label>Precio de venta</label><input type="number" id="pSale" value="${p?.salePrice || ''}" step="0.01" min="0" placeholder="opcional"></div>
          <div class="form-group"><label>Stock mínimo</label><input type="number" id="pMin" value="${p?.minStock || 0}" step="any" min="0"></div>
        </div>
        <div class="form-group"><label>Estado</label><select id="pActive"><option value="1" ${p?.active !== false ? 'selected' : ''}>Activo</option><option value="0" ${p?.active === false ? 'selected' : ''}>Inactivo</option></select></div>
        <div class="form-group"><label>Notas</label><input type="text" id="pNotes" value="${p?.notes || ''}"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar' : 'Agregar'}</button>
        </div>
      </form>
    `);
    $('#productForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: $('#pName').value, category: $('#pCategory').value, unit: $('#pUnit').value,
        avgCost: Number($('#pCost').value), salePrice: $('#pSale').value ? Number($('#pSale').value) : null,
        minStock: Number($('#pMin').value), active: $('#pActive').value === '1', notes: $('#pNotes').value
      };
      try {
        if (isEdit) await api(`/api/products/${p.id}`, { method: 'PUT', body });
        else {
          await api('/api/products', { method: 'POST', body });
          await loadProducts();
        }
        closeModal();
        toast(isEdit ? 'Producto actualizado' : 'Producto agregado');
        if (currentSection === 'inventario') {
          renderInventario();
          const msg = $('#captureMsg');
          if (msg) { msg.textContent = '✔ Producto agregado. Continúa contando'; msg.className = 'capture-message ok'; }
        } else {
          renderProductos();
        }
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  window.appEditProduct = async function(id) {
    const p = allProducts.find(x => x.id === id);
    if (p) openProductModal(p);
  };
  window.appDeleteProduct = async function(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    try { await api(`/api/products/${id}`, { method: 'DELETE' }); toast('Producto eliminado'); renderProductos(); }
    catch (err) { toast(err.message, 'error'); }
  };

  // ==================== HISTORIAL ====================
  async function renderHistorial() {
    const s = $('#section-historial');
    s.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      const cycles = await api('/api/cycles');
      const closed = cycles.filter(c => c.status === 'cerrado');
      s.innerHTML = `
        <div class="page-header"><h1>Historial de Inventarios</h1></div>
        ${closed.length === 0 ? '<div class="empty-state">Aún no hay ciclos cerrados.</div>' : `
        <div class="panel">
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>Período</th><th>Compras</th><th>Ventas</th><th>Pérdidas</th><th>Ganancia Neta</th><th>Registros</th><th>Acciones</th></tr></thead>
              <tbody>
                ${closed.map(c => `
                  <tr>
                    <td><strong>${c.startDate}</strong> al <strong>${c.endDate || '—'}</strong></td>
                    <td>${money(c.totalPurchases)}</td>
                    <td>${money(c.totalSales)}</td>
                    <td>${money(c.totalLosses)}</td>
                    <td class="${c.netProfit >= 0 ? 'text-positive' : 'text-negative'}"><strong>${money(c.netProfit)}</strong></td>
                    <td>${c.entryCount || '—'}</td>
                    <td class="actions-cell">
                      <button class="btn btn-secondary btn-sm" onclick="appViewCycle('${c.id}')">Ver</button>
                      <button class="btn btn-secondary btn-sm" onclick="appCyclePDF('${c.id}')">PDF</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`}
      `;
    } catch (err) { s.innerHTML = `<div class="error-msg">${err.message}</div>`; }
  }

  window.appViewCycle = function(id) { switchSection('informes'); setTimeout(() => { const btn = $(`[data-cycle-report="${id}"]`); if (btn) btn.scrollIntoView({ block: 'center' }); }, 100); };
  window.appCyclePDF = function(id) { downloadReport(`cycle/${id}/pdf`); };

  // ==================== INFORMES ====================
  async function renderInformes() {
    const s = $('#section-informes');
    s.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      const cycles = await api('/api/cycles');
      const closed = cycles.filter(c => c.status === 'cerrado');
      s.innerHTML = `
        <div class="page-header"><h1>Informes</h1></div>

        <div class="panel" style="margin-bottom:1.5rem;">
          <h3>Importar desde Excel</h3>
          <p class="text-muted">Si tienes tu cuaderno en Excel, pásalo a la app de golpe. Descarga la plantilla, llénala y súbela. Necesita un ciclo abierto.</p>
          <div class="import-row">
            <a class="btn btn-secondary" href="/api/reports/template" target="_blank">Descargar plantilla Excel</a>
            <div class="file-upload">
              <input type="file" id="importFile" accept=".xlsx,.xls" style="display:none">
              <button class="btn btn-primary" id="btnPickImport">Subir archivo Excel</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3>Informes por Ciclo</h3>
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>Ciclo</th><th>PDF Resumen</th><th>PDF Compras</th><th>PDF Ventas</th><th>PDF Pérdidas</th><th>Excel</th></tr></thead>
              <tbody>
                ${cycles.length ? cycles.map(c => `<tr data-cycle-report="${c.id}">
                  <td><strong>${c.startDate}</strong>${c.endDate ? ` al <strong>${c.endDate}</strong>` : ' (abierto)'}</td>
                  <td>${c.status === 'cerrado' ? `<button class="btn btn-secondary btn-sm" onclick="appCyclePDF('${c.id}')">Resumen</button>` : '<span class="text-muted">—</span>'}</td>
                  <td>${c.status === 'cerrado' ? `<button class="btn btn-secondary btn-sm" onclick="appCyclePurchPDF('${c.id}')">Compras</button>` : '<span class="text-muted">—</span>'}</td>
                  <td>${c.status === 'cerrado' ? `<button class="btn btn-secondary btn-sm" onclick="appCycleSalesPDF('${c.id}')">Ventas</button>` : '<span class="text-muted">—</span>'}</td>
                  <td>${c.status === 'cerrado' ? `<button class="btn btn-secondary btn-sm" onclick="appCycleLossPDF('${c.id}')">Pérdidas</button>` : '<span class="text-muted">—</span>'}</td>
                  <td>${c.status === 'cerrado' ? `<button class="btn btn-secondary btn-sm" onclick="appCycleExcel('${c.id}')">Excel</button>` : '<span class="text-muted">—</span>'}</td>
                </tr>`).join('') : '<tr><td colspan="6" class="empty-state">No hay ciclos</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel" style="margin-top:1.5rem;">
          <h3>Informes Financieros por Ciclo</h3>
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>Ciclo</th><th>Balance General</th><th>Distribución de Saldo</th><th>Listado de Mercancía</th></tr></thead>
              <tbody>
                ${cycles.filter(c => c.status === 'cerrado').map(c => `<tr>
                  <td><strong>${c.startDate}</strong>${c.endDate ? ` al <strong>${c.endDate}</strong>` : ''}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="appBalancePDF('${c.id}')">PDF</button>
                    <button class="btn btn-secondary btn-sm" onclick="appBalanceExcel('${c.id}')">Excel</button>
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="appSaldoPDF('${c.id}')">PDF</button>
                    <button class="btn btn-secondary btn-sm" onclick="appSaldoExcel('${c.id}')">Excel</button>
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="appMercanciaPDF('${c.id}')">PDF</button>
                    <button class="btn btn-secondary btn-sm" onclick="appMercanciaExcel('${c.id}')">Excel</button>
                  </td>
                </tr>`).join('') || '<tr><td colspan="4" class="empty-state">Cierra un ciclo para generar informes financieros</td></tr>'}
              </tbody>
            </table>
          </div>
          <div style="margin-top:1rem;">
            <button class="btn btn-primary" onclick="appDocumentationPDF()">📘 Descargar documentación del programa</button>
          </div>
        </div>


        ${closed.length > 1 ? `
        <div class="panel" style="margin-top:1.5rem;">
          <h3>Comparativo entre Ciclos</h3>
          <button class="btn btn-secondary btn-sm" onclick="appComparativePDF()">Descargar comparativo PDF</button>
          <div class="chart-box" style="margin-top:1rem;"><canvas id="comparativeChart" height="120"></canvas></div>
        </div>` : ''}
      `;

      if (closed.length > 1 && window.Chart) {
        const ctx = $('#comparativeChart');
        if (ctx) {
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels: closed.map(c => c.startDate),
              datasets: [
                { label: 'Compras', data: closed.map(c => c.totalPurchases), backgroundColor: '#3498db' },
                { label: 'Ventas', data: closed.map(c => c.totalSales), backgroundColor: '#27ae60' },
                { label: 'Ganancia', data: closed.map(c => c.netProfit), backgroundColor: '#f39c12' }
              ]
            },
            options: { scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
          });
        }
      }

      $('#btnPickImport').addEventListener('click', () => $('#importFile').click());
      $('#importFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res = await fetch('/api/reports/import', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          toast(data.message);
          renderInformes();
        } catch (err) { toast(err.message, 'error'); }
        e.target.value = '';
      });
    } catch (err) { s.innerHTML = `<div class="error-msg">${err.message}</div>`; }
  }

  async function downloadReport(endpoint, filename) {
    try {
      const res = await fetch(`/api/reports/${endpoint}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Error'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || res.headers.get('content-disposition')?.split('filename=')[1] || 'informe.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Informe descargado');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.appCyclePDF = (id) => downloadReport(`cycle/${id}/pdf`);
  window.appCyclePurchPDF = (id) => downloadReport(`cycle/${id}/purchases/pdf`);
  window.appCycleSalesPDF = (id) => downloadReport(`cycle/${id}/sales/pdf`);
  window.appCycleLossPDF = (id) => downloadReport(`cycle/${id}/losses/pdf`);
  window.appCycleExcel = (id) => downloadReport(`cycle/${id}/excel`);
  window.appComparativePDF = () => downloadReport('comparative/pdf');
  window.appBalancePDF = (id) => downloadReport(`cycle/${id}/balance/pdf`);
  window.appBalanceExcel = (id) => downloadReport(`cycle/${id}/balance/excel`);
  window.appSaldoPDF = (id) => downloadReport(`cycle/${id}/saldo/pdf`);
  window.appSaldoExcel = (id) => downloadReport(`cycle/${id}/saldo/excel`);
  window.appMercanciaPDF = (id) => downloadReport(`cycle/${id}/mercancia/pdf`);
  window.appMercanciaExcel = (id) => downloadReport(`cycle/${id}/mercancia/excel`);
  window.appDocumentationPDF = () => downloadReport('documentation/pdf');

  // ==================== USUARIOS ====================
  async function renderUsers() {
    if (!isAdmin) return;
    const s = $('#section-users');
    s.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      const users = await api('/api/auth/users');
      s.innerHTML = `
        <div class="page-header"><h1>Usuarios</h1><button class="btn btn-primary" id="btnAddUser">+ Agregar Usuario</button></div>
        <div class="panel"><div class="table-container">
          <table class="data-table">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Creado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${users.map(u => `<tr>
                <td>${u.username}</td>
                <td><span class="mini-badge ${u.role === 'admin' ? 'badge-active' : 'badge-consulta'}">${u.role === 'admin' ? 'Admin' : 'Consulta'}</span></td>
                <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-MX') : '-'}</td>
                <td class="actions-cell">${u.id !== user.id ? `<button class="btn-icon btn-delete" onclick="appDeleteUser('${u.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>` : '<span class="text-muted">Tú</span>'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div></div>
      `;
      $('#btnAddUser').addEventListener('click', openUserModal);
    } catch (err) { s.innerHTML = `<div class="error-msg">${err.message}</div>`; }
  }

  function openUserModal() {
    openModal('Nuevo Usuario', `
      <form id="userForm" class="modal-form">
        <div class="form-group"><label>Usuario *</label><input type="text" id="newUsername" required></div>
        <div class="form-group"><label>Contraseña *</label><input type="password" id="newPassword" required minlength="4"></div>
        <div class="form-group"><label>Rol</label><select id="newRole"><option value="consulta">Consulta (lectura)</option><option value="admin">Administrador</option></select></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Crear</button>
        </div>
      </form>
    `);
    $('#userForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/auth/users', { method: 'POST', body: { username: $('#newUsername').value, password: $('#newPassword').value, role: $('#newRole').value } });
        closeModal(); toast('Usuario creado'); renderUsers();
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  window.appDeleteUser = async function(id) {
    if (!confirm('¿Eliminar usuario?')) return;
    try { await api(`/api/auth/users/${id}`, { method: 'DELETE' }); toast('Usuario eliminado'); renderUsers(); }
    catch (err) { toast(err.message, 'error'); }
  };

  window.closeModal = closeModal;
  switchSection('dashboard');
})();
