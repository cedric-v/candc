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
        </div>
        <p class="small">These actions reuse the same backend jobs that will later be called by automated triggers. They sync all active imported OTA calendars configured in the system.</p>
      </section>
    </div>
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
      <h2>Recent reservations</h2>
      <div id="admin-reservations" class="small">No data loaded yet.</div>
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
        const ratePeriodsWrap = document.getElementById('admin-rate-periods');
        const syncLogsWrap = document.getElementById('admin-sync-logs');
        const calendarHealthWrap = document.getElementById('admin-calendar-health');
        const operationalHealthWrap = document.getElementById('admin-operational-health');
        const syncBookingButton = document.getElementById('sync-booking-button');
        const validateCalendarButton = document.getElementById('validate-calendar-button');
        const sendArrivalButton = document.getElementById('send-arrival-button');
        let adminToken = sessionStorage.getItem('candcAdminToken') || '';
        let adminUnits = [];

        if (adminToken) {
          document.getElementById('adminToken').value = adminToken;
          loadDashboard();
        }

        async function apiFetch(method, body) {
          const response = await fetch(apiUrl, {
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

        function renderTable(rows, headers) {
          if (!rows.length) {
            return '<p class="small">No data yet.</p>';
          }
          return '<table><thead><tr>' + headers.map((header) => '<th>' + header.label + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + headers.map((header) => '<td>' + (row[header.key] ?? '-') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
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
              return '<div class="meta-row"><span class="label">' + label + '</span><span class="value">No run recorded yet.</span></div>';
            }

            return '<div class="meta-row"><span class="label">' + label + '</span><span class="value">' + [item.status, item.created_at, item.message].filter(Boolean).join(' · ') + '</span></div>';
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
            const unitOptions = adminUnits.map((unit) => '<option value="' + unit.id + '">' + unit.display_name + '</option>').join('');
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
            reservationsWrap.innerHTML = renderTable(
              data.reservations.map((item) => ({
                reference: item.public_reference,
                unit: item.unit_display_name,
                stay: item.check_in_date + ' → ' + item.check_out_date,
                guest: item.guest_first_name + ' ' + item.guest_last_name,
                status: item.status + ' / ' + (item.payment_status || '-'),
                total: item.total_amount + ' ' + item.currency,
              })),
              [
                { key: 'reference', label: 'Reference' },
                { key: 'unit', label: 'Unit' },
                { key: 'stay', label: 'Stay' },
                { key: 'guest', label: 'Guest' },
                { key: 'status', label: 'Status' },
                { key: 'total', label: 'Total' },
              ],
            );
            ratePeriodsWrap.innerHTML = renderTable(
              data.ratePeriods.map((item) => ({
                unit: item.unit_display_name,
                period: item.start_date + ' → ' + item.end_date,
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
                synced: item.last_synced_at || '-',
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
                when: item.created_at,
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
            adminNotice.className = 'notice success';
            adminNotice.textContent = 'Dashboard loaded.';
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        }

        authForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          adminToken = document.getElementById('adminToken').value.trim();
          sessionStorage.setItem('candcAdminToken', adminToken);
          await loadDashboard();
        });

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
