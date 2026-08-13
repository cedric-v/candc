import { html } from "../_lib/http.js";
import { htmlDocument } from "../_lib/ui.js";

export function onRequestGet() {
  const body = `
    <section class="hero">
      <h1>Booking admin</h1>
      <p>Use a dedicated admin token to review reservations, add special pricing periods, and manually launch the key operational jobs.</p>
    </section>
    <div class="grid cols-2">
      <section class="card stack">
        <h2>Access</h2>
        <form id="admin-auth-form">
          <div class="field">
            <label for="adminToken">Admin token</label>
            <input id="adminToken" name="adminToken" type="password" autocomplete="off" placeholder="Paste the admin token here">
          </div>
          <div class="actions">
            <button class="btn-primary" type="submit">Load dashboard</button>
          </div>
        </form>
        <div id="admin-notice" class="notice info">Paste your admin token to load the dashboard.</div>
      </section>
      <section class="card stack">
        <h2>Quick actions</h2>
        <div class="actions">
          <button class="btn-secondary" type="button" id="sync-booking-button">Run calendar sync</button>
          <button class="btn-secondary" type="button" id="validate-calendar-button">Validate OTA feeds</button>
          <button class="btn-secondary" type="button" id="send-arrival-button">Send today's arrival emails</button>
          <button class="btn-secondary" type="button" id="retention-button">Anonymize old sensitive data</button>
        </div>
        <p class="small">These actions reuse the same backend jobs that will later be called by automated triggers. They sync all active imported OTA calendars configured in the system.</p>
      </section>
    </div>
    <section class="card stack" style="margin-top:18px">
      <h2>Reservations</h2>
      <div class="field-row three">
        <div class="field">
          <label for="resScope">Period</label>
          <select id="resScope">
            <option value="upcoming" selected>Upcoming</option>
            <option value="past">Past</option>
            <option value="all">All</option>
          </select>
        </div>
        <div class="field">
          <label for="resStatus">Status</label>
          <select id="resStatus">
            <option value="active" selected>Active (paid)</option>
            <option value="attention">Needs attention</option>
            <option value="closed">Closed</option>
            <option value="all">All statuses</option>
          </select>
        </div>
        <div class="field">
          <label for="resUnit">Unit</label>
          <select id="resUnit">
            <option value="">All units</option>
          </select>
        </div>
      </div>
      <p class="small" id="admin-reservations-hint">Upcoming stays that are confirmed and paid by default; other statuses are hidden until you select them.</p>
      <div id="admin-reservations" class="small">No data loaded yet.</div>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Operational health</h2>
      <div id="admin-operational-health" class="small">No data loaded yet.</div>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Special pricing period</h2>
      <form id="rate-period-form" class="stack">
        <div class="field-row three">
          <div class="field">
            <label for="unitId">Unit</label>
            <select id="unitId" name="unitId"></select>
          </div>
          <div class="field">
            <label for="startDate">Start date</label>
            <input id="startDate" name="startDate" type="date" required>
          </div>
          <div class="field">
            <label for="endDate">End date</label>
            <input id="endDate" name="endDate" type="date" required>
          </div>
        </div>
        <div class="field-row three">
          <div class="field">
            <label for="nightlyBaseRate">Nightly base rate (CHF)</label>
            <input id="nightlyBaseRate" name="nightlyBaseRate" type="number" min="0" step="0.01" required>
          </div>
          <div class="field">
            <label for="label">Label</label>
            <input id="label" name="label" type="text" placeholder="2026 Hockey Worlds">
          </div>
          <div class="field">
            <label for="priority">Priority</label>
            <input id="priority" name="priority" type="number" min="1" step="1" value="100">
          </div>
        </div>
        <div class="actions">
          <button class="btn-primary" type="submit">Save pricing period</button>
        </div>
      </form>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Long-stay discounts</h2>
      <p class="small">Configure up to four long-stay discount tiers per unit. The highest eligible tier is applied automatically and still appears as a single “Long-stay discount” line in the customer quote.</p>
      <form id="long-stay-form" class="stack">
        <div class="field">
          <label for="longStayUnitId">Unit</label>
          <select id="longStayUnitId" name="unitId"></select>
        </div>
        <div class="field-row three">
          <div class="field">
            <label for="longStayNights1">Tier 1 minimum nights</label>
            <input id="longStayNights1" name="longStayNights1" type="number" min="1" step="1">
          </div>
          <div class="field">
            <label for="longStayRate1">Tier 1 discount (%)</label>
            <input id="longStayRate1" name="longStayRate1" type="number" min="0" max="100" step="0.01">
          </div>
          <div class="field">
            <label> </label>
            <div class="small" id="longStayHint1">Current suggestion will appear here.</div>
          </div>
        </div>
        <div class="field-row three">
          <div class="field">
            <label for="longStayNights2">Tier 2 minimum nights</label>
            <input id="longStayNights2" name="longStayNights2" type="number" min="1" step="1">
          </div>
          <div class="field">
            <label for="longStayRate2">Tier 2 discount (%)</label>
            <input id="longStayRate2" name="longStayRate2" type="number" min="0" max="100" step="0.01">
          </div>
          <div class="field">
            <label> </label>
            <div class="small" id="longStayHint2">Current suggestion will appear here.</div>
          </div>
        </div>
        <div class="field-row three">
          <div class="field">
            <label for="longStayNights3">Tier 3 minimum nights</label>
            <input id="longStayNights3" name="longStayNights3" type="number" min="1" step="1">
          </div>
          <div class="field">
            <label for="longStayRate3">Tier 3 discount (%)</label>
            <input id="longStayRate3" name="longStayRate3" type="number" min="0" max="100" step="0.01">
          </div>
          <div class="field">
            <label> </label>
            <div class="small" id="longStayHint3">Current suggestion will appear here.</div>
          </div>
        </div>
        <div class="field-row three">
          <div class="field">
            <label for="longStayNights4">Tier 4 minimum nights</label>
            <input id="longStayNights4" name="longStayNights4" type="number" min="1" step="1">
          </div>
          <div class="field">
            <label for="longStayRate4">Tier 4 discount (%)</label>
            <input id="longStayRate4" name="longStayRate4" type="number" min="0" max="100" step="0.01">
          </div>
          <div class="field">
            <label> </label>
            <div class="small" id="longStayHint4">Leave empty if this unit does not use a fourth tier.</div>
          </div>
        </div>
        <div class="actions">
          <button class="btn-primary" type="submit">Save long-stay discounts</button>
        </div>
        <div id="long-stay-notice" class="notice info" hidden>Update the tiers for a unit, then save them here.</div>
      </form>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Configured pricing periods</h2>
      <div id="admin-rate-periods" class="small">No data loaded yet.</div>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Calendar source health</h2>
      <div id="admin-calendar-health" class="small">No data loaded yet.</div>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Recent sync logs</h2>
      <div id="admin-sync-logs" class="small">No data loaded yet.</div>
    </section>
    <script>
      (() => {
        const apiUrl = '/api/admin/booking';
        const authForm = document.getElementById('admin-auth-form');
        const ratePeriodForm = document.getElementById('rate-period-form');
        const longStayForm = document.getElementById('long-stay-form');
        const adminNotice = document.getElementById('admin-notice');
        const longStayNotice = document.getElementById('long-stay-notice');
        const longStaySubmitButton = longStayForm.querySelector('button[type="submit"]');
        const unitSelect = document.getElementById('unitId');
        const longStayUnitSelect = document.getElementById('longStayUnitId');
        const reservationsWrap = document.getElementById('admin-reservations');
        const resScope = document.getElementById('resScope');
        const resStatus = document.getElementById('resStatus');
        const resUnit = document.getElementById('resUnit');
        const ratePeriodsWrap = document.getElementById('admin-rate-periods');
        const syncLogsWrap = document.getElementById('admin-sync-logs');
        const calendarHealthWrap = document.getElementById('admin-calendar-health');
        const operationalHealthWrap = document.getElementById('admin-operational-health');
        const syncBookingButton = document.getElementById('sync-booking-button');
        const validateCalendarButton = document.getElementById('validate-calendar-button');
        const sendArrivalButton = document.getElementById('send-arrival-button');
        const retentionButton = document.getElementById('retention-button');
        const adminTimeZone = 'Europe/Zurich';
        const dateFormatter = new Intl.DateTimeFormat('fr-CH', {
          timeZone: adminTimeZone,
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const dateTimeFormatter = new Intl.DateTimeFormat('fr-CH', {
          timeZone: adminTimeZone,
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        });
        let adminToken = sessionStorage.getItem('candcAdminToken') || '';
        let adminUnits = [];

        if (adminToken) {
          document.getElementById('adminToken').value = adminToken;
          loadDashboard();
        }

        async function apiFetch(method, body, query = {}) {
          const url = new URL(apiUrl, window.location.origin);
          for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== '') {
              url.searchParams.set(key, value);
            }
          }
          const response = await fetch(url, {
            method,
            headers: {
              'content-type': 'application/json',
              'x-admin-token': adminToken,
            },
            body: body ? JSON.stringify(body) : undefined,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message || 'Request failed');
          }
          return data;
        }

        function escapeHtml(value) {
          return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        function renderTable(rows, headers) {
          if (!rows.length) {
            return '<p class="small">No data yet.</p>';
          }
          return '<div class="table-scroll"><table><thead><tr>' + headers.map((header) => '<th>' + escapeHtml(header.label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + headers.map((header) => '<td data-label="' + escapeHtml(header.label) + '">' + escapeHtml(row[header.key] ?? '-') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
        }

        function maskIdDocument(value) {
          const raw = String(value ?? '').trim();
          if (!raw) {
            return '-';
          }
          if (raw.length <= 4) {
            return '••••';
          }
          return '••••••••' + raw.slice(-4);
        }

        function parseAdditionalGuests(raw) {
          if (!raw) {
            return [];
          }
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }

        // Tableau des réservations avec un détail dépliable par ligne :
        // coordonnées complètes du client. Le n° de pièce d'identité est
        // masqué par défaut (LPD / RGPD) et révélable sur demande.
        function renderReservations(rows) {
          if (!rows.length) {
            return '<p class="small">No data yet.</p>';
          }

          // Unités qui proposent l'option WC-douche intérieure (réglage
          // unit-level, pas de règle métier codée en dur).
          const wcUnits = new Set(
            (adminUnits || [])
              .filter((unit) => unit.settings?.allowsWcShowerOption)
              .map((unit) => unit.code),
          );

          const headers = [
            { key: 'reference', label: 'Reference' },
            { key: 'unit', label: 'Unit' },
            { key: 'stay', label: 'Stay' },
            { key: 'guest', label: 'Guest' },
            { key: 'status', label: 'Status' },
            { key: 'wc', label: 'Toilets' },
            { key: 'total', label: 'Total' },
          ];

          const rowsHtml = rows.map((item) => {
            const ref = item.public_reference || item.id;
            const detailsId = 'admin-details-' + ref;
            const address = [item.guest_address_street, item.guest_address_zip, item.guest_address_city, item.guest_address_country].filter(Boolean).join(', ') || '-';
            const phone = item.guest_mobile_phone || item.guest_phone || '-';
            const additionalGuests = parseAdditionalGuests(item.additional_guests_json)
              .map((guest) => [guest.firstName, guest.lastName].filter(Boolean).join(' '))
              .filter(Boolean)
              .join(', ') || '-';
            const offersWc = wcUnits.has(item.unit_code);
            const wcRequested = offersWc && Boolean(item.wc_shower_requested);

            const cells = headers.map((header) => {
              let content;
              if (header.key === 'wc') {
                content = wcRequested
                  ? '<span class="wc-flag" title="Indoor WC and shower access requested">WC access requested</span>'
                  : '—';
              } else {
                content = escapeHtml(item[header.key] ?? '-');
              }
              return '<td data-label="' + escapeHtml(header.label) + '">' + content + '</td>';
            }).join('');

            const wcStatus = offersWc
              ? (item.wc_shower_requested
                  ? (item.wc_shower_confirmed ? 'Requested — confirmed' : 'Requested — not confirmed')
                  : 'Not requested')
              : 'Not offered';

            const detailsRows = [
              ['Email', item.guest_email || '-'],
              ['Phone', phone],
              ['Address', address],
              ['Date of birth', item.guest_date_of_birth || '-'],
              ['Nationality', item.guest_nationality || '-'],
              ['WC/shower access', wcStatus],
              ['Locale', item.locale || '-'],
              ['Additional guests', additionalGuests],
              ['Remarks', item.remarks || '-'],
            ].map(([label, value]) =>
              '<div class="meta-row"><span class="label">' + escapeHtml(label) + '</span><span class="value">' + escapeHtml(value) + '</span></div>',
            ).join('');

            const idRow =
              '<div class="meta-row"><span class="label">ID document</span>' +
              '<span class="value admin-id-value" data-full="' + escapeHtml(item.guest_id_document_number || '') + '">' + escapeHtml(maskIdDocument(item.guest_id_document_number)) + '</span> ' +
              (item.guest_id_document_number ? '<button type="button" class="admin-id-reveal" style="padding:4px 12px;font-size:0.8rem" data-action="reveal">Reveal</button>' : '') +
              '</div>';

            return (
              '<tr class="admin-res-row">' + cells +
              '<td class="admin-res-actions" data-label=""><button type="button" class="admin-res-toggle" data-target="' + escapeHtml(detailsId) + '" style="padding:6px 12px;font-size:0.82rem">Details ▾</button></td></tr>' +
              '<tr class="admin-res-details" id="' + escapeHtml(detailsId) + '" hidden><td colspan="8">' +
              '<div class="meta">' + detailsRows + idRow + '</div>' +
              '</td></tr>'
            );
          }).join('');

          return '<div class="table-scroll"><table class="admin-res-table"><thead><tr>' + headers.map((header) => '<th>' + escapeHtml(header.label) + '</th>').join('') + '<th></th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
        }

        function isIsoDateOnly(value) {
          return typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value);
        }

        function formatAdminDate(value) {
          if (!value) {
            return '-';
          }

          if (isIsoDateOnly(value)) {
            const parts = value.split('-');
            return parts[2] + '.' + parts[1] + '.' + parts[0];
          }

          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            return value;
          }

          return dateFormatter.format(parsed);
        }

        function formatAdminDateTime(value) {
          if (!value) {
            return '-';
          }

          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            return value;
          }

          return dateTimeFormatter.format(parsed);
        }

        function computeHealthBadge(item) {
          if (!item) {
            return 'Unknown';
          }

          if (item.last_status === 'failed') {
            return 'Failed';
          }

          if (!item.last_synced_at) {
            return 'Never synced';
          }

          const ageHours = (Date.now() - new Date(item.last_synced_at).getTime()) / 3600000;
          if (ageHours > 6) {
            return 'Stale';
          }

          return 'Healthy';
        }

        function renderOperationalHealth(data) {
          const rows = [
            ['Calendar sync job', data?.calendarSyncJob],
            ['Arrival email job', data?.arrivalEmailJob],
            ['Feed validation', data?.calendarValidationJob],
          ];

          operationalHealthWrap.innerHTML = rows.map(([label, item]) => {
            if (!item) {
              return '<div class="meta-row"><span class="label">' + escapeHtml(label) + '</span><span class="value">No run recorded yet.</span></div>';
            }

            const message = [item.status, formatAdminDateTime(item.created_at), item.message].filter(Boolean).join(' · ');
            return '<div class="meta-row"><span class="label">' + escapeHtml(label) + '</span><span class="value">' + escapeHtml(message) + '</span></div>';
          }).join('');
        }

        function getLongStayInputs() {
          return [1, 2, 3, 4].map((index) => ({
            nights: longStayForm.elements['longStayNights' + index],
            rate: longStayForm.elements['longStayRate' + index],
            hint: document.getElementById('longStayHint' + index),
          }));
        }

        function formatRatePercent(rate) {
          return Number(rate * 100).toFixed(2).replace(/\.00$/, '');
        }

        function syncLongStaySuggestions(tiers) {
          getLongStayInputs().forEach((row, index) => {
            const tier = tiers[index];
            if (tier) {
              row.nights.placeholder = String(tier.minNights);
              row.rate.placeholder = formatRatePercent(tier.rate);
              row.hint.textContent = 'Current: ' + tier.minNights + ' nights or more = ' + formatRatePercent(tier.rate) + '%';
            } else {
              row.nights.placeholder = '';
              row.rate.placeholder = '';
              row.hint.textContent = 'Leave empty if this unit does not use an additional tier.';
            }
          });
        }

        function fillLongStayForm(unitId) {
          const unit = adminUnits.find((item) => item.id === unitId);
          const tiers = Array.isArray(unit?.settings?.longStayDiscountTiers)
            ? [...unit.settings.longStayDiscountTiers].sort((left, right) => left.minNights - right.minNights)
            : [];

          syncLongStaySuggestions(tiers);

          getLongStayInputs().forEach((row, index) => {
            const tier = tiers[index];
            row.nights.value = tier?.minNights || '';
            row.rate.value = tier ? formatRatePercent(tier.rate) : '';
          });
        }

        function setLongStayNotice(type, message) {
          longStayNotice.hidden = false;
          longStayNotice.className = 'notice ' + type;
          longStayNotice.textContent = message;
        }

        async function loadDashboard() {
          adminNotice.className = 'notice info';
          adminNotice.textContent = 'Loading dashboard…';
          try {
            const selectedRateUnitId = unitSelect.value;
            const selectedLongStayUnitId = longStayUnitSelect.value;
            const data = await apiFetch('GET');
            adminUnits = data.units || [];
            const unitOptions = adminUnits.map((unit) => '<option value="' + escapeHtml(unit.id) + '">' + escapeHtml(unit.display_name) + '</option>').join('');
            unitSelect.innerHTML = unitOptions;
            longStayUnitSelect.innerHTML = unitOptions;
            if (selectedRateUnitId && adminUnits.some((unit) => unit.id === selectedRateUnitId)) {
              unitSelect.value = selectedRateUnitId;
            }
            if (selectedLongStayUnitId && adminUnits.some((unit) => unit.id === selectedLongStayUnitId)) {
              longStayUnitSelect.value = selectedLongStayUnitId;
            } else if (adminUnits[0]) {
              longStayUnitSelect.value = adminUnits[0].id;
            }
            if (longStayUnitSelect.value) {
              fillLongStayForm(longStayUnitSelect.value);
            }
            const selectedResUnit = resUnit.value;
            resUnit.innerHTML = '<option value="">All units</option>' + adminUnits.map((unit) => '<option value="' + escapeHtml(unit.code) + '">' + escapeHtml(unit.display_name) + '</option>').join('');
            if (selectedResUnit && adminUnits.some((unit) => unit.code === selectedResUnit)) {
              resUnit.value = selectedResUnit;
            }
            ratePeriodsWrap.innerHTML = renderTable(
              data.ratePeriods.map((item) => ({
                unit: item.unit_display_name,
                period: formatAdminDate(item.start_date) + ' → ' + formatAdminDate(item.end_date),
                rate: item.nightly_base_rate + ' CHF',
                label: item.label || '-',
                priority: item.priority,
              })),
              [
                { key: 'unit', label: 'Unit' },
                { key: 'period', label: 'Period' },
                { key: 'rate', label: 'Nightly rate' },
                { key: 'label', label: 'Label' },
                { key: 'priority', label: 'Priority' },
              ],
            );
            renderOperationalHealth(data.operationalHealth);
            calendarHealthWrap.innerHTML = renderTable(
              data.calendarHealth.map((item) => ({
                unit: item.unit_display_name,
                source: item.source_code,
                health: computeHealthBadge(item),
                synced: formatAdminDateTime(item.last_synced_at),
                imported: String(item.future_block_count ?? 0),
                lastStatus: item.last_status || '-',
                lastMessage: item.last_message || '-',
              })),
              [
                { key: 'unit', label: 'Unit' },
                { key: 'source', label: 'Source' },
                { key: 'health', label: 'Health' },
                { key: 'synced', label: 'Last synced' },
                { key: 'imported', label: 'Future blocks' },
                { key: 'lastStatus', label: 'Last status' },
                { key: 'lastMessage', label: 'Last message' },
              ],
            );
            syncLogsWrap.innerHTML = renderTable(
              data.syncLogs.map((item) => ({
                when: formatAdminDateTime(item.created_at),
                type: item.sync_type,
                unit: item.unit_display_name || '-',
                status: item.status,
                message: item.message || '-',
              })),
              [
                { key: 'when', label: 'When' },
                { key: 'type', label: 'Type' },
                { key: 'unit', label: 'Unit' },
                { key: 'status', label: 'Status' },
                { key: 'message', label: 'Message' },
              ],
            );
            await loadReservations();
            adminNotice.className = 'notice success';
            adminNotice.textContent = 'Dashboard loaded.';
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        }

        async function loadReservations() {
          try {
            reservationsWrap.innerHTML = '<p class="small">Loading reservations…</p>';
            const data = await apiFetch('GET', undefined, {
              scope: resScope.value,
              status: resStatus.value,
              unit: resUnit.value,
            });
            const rows = (data.reservations || []).map((item) => ({
              ...item,
              reference: item.public_reference,
              unit: item.unit_display_name || item.unit_code,
              stay: formatAdminDate(item.check_in_date) + ' → ' + formatAdminDate(item.check_out_date),
              guest: item.guest_first_name + ' ' + item.guest_last_name,
              status: item.status + ' / ' + (item.payment_status || '-'),
              total: item.total_amount + ' ' + item.currency,
            }));
            reservationsWrap.innerHTML = renderReservations(rows);
          } catch (error) {
            reservationsWrap.innerHTML = '<p class="small">Failed to load reservations: ' + escapeHtml(error.message) + '</p>';
          }
        }

        authForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          adminToken = document.getElementById('adminToken').value.trim();
          sessionStorage.setItem('candcAdminToken', adminToken);
          await loadDashboard();
        });

        resScope.addEventListener('change', loadReservations);
        resStatus.addEventListener('change', loadReservations);
        resUnit.addEventListener('change', loadReservations);

        ratePeriodForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          try {
            await apiFetch('POST', {
              action: 'create_rate_period',
              unitId: ratePeriodForm.elements.unitId.value,
              startDate: ratePeriodForm.elements.startDate.value,
              endDate: ratePeriodForm.elements.endDate.value,
              nightlyBaseRate: ratePeriodForm.elements.nightlyBaseRate.value,
              label: ratePeriodForm.elements.label.value,
              priority: ratePeriodForm.elements.priority.value,
            });
            adminNotice.className = 'notice success';
            adminNotice.textContent = 'Pricing period saved.';
            ratePeriodForm.reset();
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        });

        longStayUnitSelect.addEventListener('change', () => {
          fillLongStayForm(longStayUnitSelect.value);
          setLongStayNotice('info', 'Adjust the tiers for this unit, then save your changes.');
        });

        longStayForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          longStaySubmitButton.disabled = true;
          longStaySubmitButton.textContent = 'Saving…';
          setLongStayNotice('info', 'Saving long-stay discounts…');
          try {
            const tiers = getLongStayInputs()
              .map((row) => ({
                minNights: Number(row.nights.value || 0),
                rate: Number(row.rate.value || 0) / 100,
              }))
              .filter((tier) => tier.minNights > 0 && tier.rate > 0);

            await apiFetch('POST', {
              action: 'update_long_stay_discounts',
              unitId: longStayForm.elements.unitId.value,
              tiers,
            });
            adminNotice.className = 'notice success';
            adminNotice.textContent = 'Long-stay discounts saved.';
            setLongStayNotice('success', 'Long-stay discounts saved successfully.');
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
            setLongStayNotice('error', error.message);
          } finally {
            longStaySubmitButton.disabled = false;
            longStaySubmitButton.textContent = 'Save long-stay discounts';
          }
        });

        syncBookingButton.addEventListener('click', async () => {
          try {
            adminNotice.className = 'notice info';
            adminNotice.textContent = 'Running calendar sync…';
            await apiFetch('POST', { action: 'run_booking_sync' });
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        });

        validateCalendarButton.addEventListener('click', async () => {
          try {
            adminNotice.className = 'notice info';
            adminNotice.textContent = 'Validating OTA feeds…';
            await apiFetch('POST', { action: 'validate_calendar_sources' });
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        });

        sendArrivalButton.addEventListener('click', async () => {
          try {
            adminNotice.className = 'notice info';
            adminNotice.textContent = 'Sending arrival emails…';
            await apiFetch('POST', { action: 'run_arrival_emails' });
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        });

        retentionButton.addEventListener('click', async () => {
          try {
            adminNotice.className = 'notice info';
            adminNotice.textContent = 'Anonymizing sensitive guest data…';
            const result = await apiFetch('POST', { action: 'run_sensitive_data_retention' });
            adminNotice.className = 'notice success';
            adminNotice.textContent = 'Retention done: ' + (result.anonymized ?? 0) + ' reservation(s) anonymized (check-out before ' + (result.cutoffDate || 'cutoff') + ').';
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        });

        // Détail dépliable des réservations (coordonnées client) et
        // révélation masquée du n° de pièce d'identité.
        reservationsWrap.addEventListener('click', (event) => {
          const toggle = event.target.closest('.admin-res-toggle');
          if (toggle) {
            const details = document.getElementById(toggle.dataset.target);
            if (details) {
              const hidden = details.hidden;
              details.hidden = !hidden;
              toggle.textContent = hidden ? 'Details ▴' : 'Details ▾';
            }
            return;
          }

          const reveal = event.target.closest('.admin-id-reveal');
          if (reveal) {
            const valueEl = reveal.parentElement.querySelector('.admin-id-value');
            if (valueEl) {
              const full = valueEl.dataset.full || '';
              if (reveal.dataset.action === 'reveal') {
                valueEl.textContent = full;
                reveal.dataset.action = 'hide';
                reveal.textContent = 'Hide';
              } else {
                valueEl.textContent = maskIdDocument(full);
                reveal.dataset.action = 'reveal';
                reveal.textContent = 'Reveal';
              }
            }
          }
        });
      })();
    </script>
  `;

  return html(
    htmlDocument({
      title: "Booking admin",
      body,
      lang: "en",
    }),
  );
}
